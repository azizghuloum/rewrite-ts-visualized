import { assert } from "./assert";
import fs from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { mtime } from "./fs-helpers";
import { parse } from "./parse";
import { core_patterns } from "./syntax-core-patterns";
import { initial_step } from "./expander";
import { pprint } from "./pprint";
import { generate_proxy_code } from "./proxy-code";
import { debug, print_stx_error, StxError, syntax_error } from "./stx-error";
import {
  imported_module,
  import_resolution,
  preexpand_helpers,
  get_exported_identifiers_from_rib,
} from "./preexpand-helpers";
import { source_file } from "./ast";
import { normalize } from "node:path";
import { Loc } from "./syntax-structures";
import stringify from "json-stringify-pretty-compact";

type module_state =
  | { type: "initial" }
  | { type: "stale"; cid: string; pkg: Package; pkg_relative_path: string }
  | {
      type: "fresh";
      cid: string;
      pkg: Package;
      pkg_relative_path: string;
      exported_identifiers: { [name: string]: import_resolution[] };
    }
  | { type: "error"; reason: string };

class Module implements imported_module {
  private path: string;
  private library_manager: LibraryManager;
  private state: module_state = { type: "initial" };
  private imported_modules: Module[] = [];

  constructor(path: string, library_manager: LibraryManager) {
    this.path = path;
    this.library_manager = library_manager;
  }

  async ensureUpToDate(): Promise<void> {
    switch (this.state.type) {
      case "initial":
        return this.initialize().then(() => this.ensureUpToDate());
      case "stale":
        return this.recompile().then(() => this.ensureUpToDate());
      case "fresh":
      case "error":
        return;
      default: {
        const invalid: never = this.state;
        throw new Error(`ensureUpToDate: unhandled state ${invalid}`);
      }
    }
  }

  private get_json_path(): string {
    return join(dirname(this.path), ".rts", basename(this.path) + ".json");
  }

  private get_generated_code_absolute_path(): string {
    return join(dirname(this.path), ".rts", basename(this.path) + ".ts");
  }

  private get_generated_code_relative_path(): string {
    return "./.rts/" + basename(this.path) + ".ts";
  }

  private get_proxy_path(): string {
    return this.path + ".ts";
  }

  async initialize() {
    assert(this.state.type === "initial");
    console.log(`initializing ${this.path}`);
    const [pkg, pkg_relative_path] = await this.library_manager.findPackage(this.path);
    const cid = `${pkg_relative_path} ${pkg.name} ${pkg.version}`;
    const json_path = this.get_json_path();
    const json_mtime = await mtime(json_path);
    const my_mtime = await mtime(this.path);
    assert(my_mtime !== undefined);
    //console.log({ cid, my_mtime, json_path });
    if (my_mtime >= (json_mtime ?? 0)) {
      this.state = { type: "stale", cid, pkg, pkg_relative_path };
    } else {
      const json = JSON.parse(await fs.readFile(json_path, { encoding: "utf8" }));
      assert(json.cid === cid);
      assert(json.exported_identifiers !== undefined, `no exported_identifiers in ${json_path}`);
      console.error("TODO: check dependencies");
      this.state = {
        type: "fresh",
        cid,
        pkg,
        pkg_relative_path,
        exported_identifiers: json.exported_identifiers,
      };
    }
  }

  async recompile() {
    assert(this.state.type === "stale");
    console.log(`expanding ${this.state.cid}`);
    const code = await fs.readFile(this.path, { encoding: "utf-8" });
    const patterns = core_patterns(parse);
    const source_file: source_file = {
      package: { name: this.state.pkg.name, version: this.state.pkg.version },
      path: this.state.pkg_relative_path,
    };
    const [_loc0, expand] = initial_step(parse(code, source_file), this.state.cid, patterns);
    try {
      const helpers: preexpand_helpers = {
        manager: {
          resolve_import: async (loc) => {
            assert(loc.t.tag === "string");
            const import_path = JSON.parse(loc.t.content);
            const mod = this.get_imported_modules_for_path(import_path, loc);
            return mod;
          },
        },
        inspect(_loc, _reason, k) {
          return k();
        },
      };
      const { loc, unit: _unit, context, modular } = await expand(helpers);
      assert(modular.extensible);
      const proxy_code = generate_proxy_code(
        this.get_generated_code_relative_path(),
        modular,
        context,
      );
      const exported_identifiers = get_exported_identifiers_from_rib(
        modular.explicit,
        this.state.cid,
      );
      const json_content = { cid: this.state.cid, exported_identifiers };
      const code_path = this.get_generated_code_absolute_path();
      await fs.mkdir(dirname(code_path), { recursive: true });
      await fs.writeFile(code_path, await pprint(loc));
      await fs.writeFile(this.get_proxy_path(), proxy_code);
      await fs.writeFile(this.get_json_path(), stringify(json_content));
      this.state = { ...this.state, type: "fresh", ...json_content };
    } catch (error) {
      if (error instanceof StxError) {
        await print_stx_error(error, this.library_manager);
      } else {
        console.error(error);
      }
      this.state = { type: "error", reason: String(error) };
    }
  }

  async resolve_exported_identifier(name: string, loc: Loc): Promise<import_resolution[]> {
    await this.ensureUpToDate();
    const state = this.state;
    if (state.type !== "fresh") syntax_error(loc, "module has errors");
    const { exported_identifiers } = state;
    const resolutions = exported_identifiers[name];
    if (!resolutions || resolutions.length === 0) {
      syntax_error(loc, `module does not export such identifier`);
    }
    return resolutions;
  }

  private get_imported_modules_for_path(import_path: string, loc: Loc): Module {
    const mod = this.library_manager.do_import(import_path, this.path);
    if (this.imported_modules.includes(mod)) return mod;
    const self = this;
    function check(mod: Module) {
      if (mod === self) {
        syntax_error(loc, `circular import`);
      }
      mod.imported_modules.forEach(check);
    }
    check(mod);
    this.imported_modules.push(mod);
    return mod;
  }
}

class Package {
  name: string;
  version: string;
  dir: string;

  constructor(name: string, version: string, dir: string) {
    this.name = name;
    this.version = version;
    this.dir = dir;
  }
}

export class LibraryManager {
  private modules: { [path: string]: Module } = {};
  private packages: { [dir: string]: Package } = {};

  private get_or_create_module(path: string) {
    const mod = (this.modules[path] ??= new Module(path, this));
    return mod;
  }

  async ensureUpToDate(path: string) {
    const mod = this.get_or_create_module(path);
    await mod.ensureUpToDate();
    return mod;
  }

  get_package(name: string, version: string): Package | undefined {
    return Object.values(this.packages).find((x) => x.name === name && x.version === version);
  }

  async findPackage(path: string): Promise<[Package, string]> {
    const base = basename(path);
    const dir = dirname(path);
    const existing = this.packages[dir];
    if (existing) return [existing, base];
    const pkg_path = join(dir, "package.json");
    try {
      const content = await fs.readFile(pkg_path, { encoding: "utf8" });
      const json = JSON.parse(content);
      const { name, version } = json;
      assert(typeof name === "string");
      assert(typeof version === "string");
      return [(this.packages[dir] ??= new Package(name, version, dir)), base];
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        const [pkg, pkg_base] = await this.findPackage(dir);
        return [pkg, join(pkg_base, base)];
      } else {
        throw err;
      }
    }
  }

  do_import(import_path: string, importer_path: string) {
    function is_relative(path: string): boolean {
      return path.startsWith("./") || path.startsWith("../");
    }
    function join_relative(import_path: string, importer_path: string): string {
      const path = dirname(importer_path) + "/" + import_path;
      return normalize(path);
    }
    function find_absolute_path(_import_path: string): string {
      throw new Error("TODO find_absolute_path");
    }
    const actual_path = is_relative(import_path)
      ? join_relative(import_path, importer_path)
      : find_absolute_path(import_path);
    const mod = this.get_or_create_module(actual_path);
    return mod;
  }
}
