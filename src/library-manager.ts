import { assert } from "./assert";
import fs from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { mtime } from "./fs-helpers";
import { parse } from "./parse";
import { initial_step } from "./expander";
import { pprint } from "./pprint";
import { generate_proxy_code } from "./proxy-code";
import { print_stx_error, StxError, syntax_error } from "./stx-error";
import {
  imported_module,
  import_resolution,
  preexpand_helpers,
  get_exported_identifiers_from_rib,
} from "./preexpand-helpers";
import { AST, source_file } from "./ast";
import { normalize } from "node:path";
import { Binding, CompilationUnit, Context, Loc, Rib } from "./syntax-structures";
import stringify from "json-stringify-pretty-compact";
import { init_global_context } from "./global-module";

const cookie = "rewrite-ts-016";

type module_state =
  | { type: "initial" }
  | { type: "initializing"; promise: Promise<void> }
  | { type: "stale"; cid: string; pkg: Package; pkg_relative_path: string }
  | {
      type: "compiling";
      cid: string;
      pkg: Package;
      pkg_relative_path: string;
      promise: Promise<void>;
    }
  | {
      type: "fresh";
      cid: string;
      pkg: Package;
      pkg_relative_path: string;
      exported_identifiers: { [name: string]: import_resolution[] };
      context: Context;
      unit: CompilationUnit;
      mtime: number;
    }
  | { type: "error"; reason: string };

class RtsModule implements imported_module {
  private path: string;
  private library_manager: LibraryManager;
  private state: module_state = { type: "initial" };
  private libs: string[];
  private global_unit: CompilationUnit;
  private global_context: Context;
  public imported_modules: imported_module[] = [];
  public dependant_modules: imported_module[] = [];

  constructor(
    path: string,
    library_manager: LibraryManager,
    libs: string[],
    global_unit: CompilationUnit,
    global_context: Context,
  ) {
    this.path = path;
    this.library_manager = library_manager;
    this.libs = libs;
    this.global_unit = global_unit;
    this.global_context = global_context;
  }

  async ensureUpToDate(): Promise<void> {
    switch (this.state.type) {
      case "initial":
        return this.initialize().then(() => this.ensureUpToDate());
      case "initializing":
        return this.state.promise.then(() => this.ensureUpToDate());
      case "stale":
        return this.recompile().then(() => this.ensureUpToDate());
      case "compiling":
        return this.state.promise.then(() => this.ensureUpToDate());
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

  private async do_initialize() {
    assert(this.state.type === "initial", `invalid state ${this.state.type}`);
    const [pkg, pkg_relative_path] = await this.library_manager.findPackage(this.path);
    const cid = `${pkg_relative_path} ${pkg.name} ${pkg.version}`;
    console.log(`initializing ${cid}`);
    const json_path = this.get_json_path();
    const json_mtime = await mtime(json_path);
    const my_mtime = await mtime(this.path);
    assert(my_mtime !== undefined);
    if (json_mtime === undefined || my_mtime >= json_mtime) {
      this.state = { type: "stale", cid, pkg, pkg_relative_path };
      return;
    }
    const json = JSON.parse(await fs.readFile(json_path, { encoding: "utf8" }));
    if (json.cookie !== cookie) {
      this.state = { type: "stale", cid, pkg, pkg_relative_path };
      return;
    }
    assert(json.cid === cid);
    assert(json.exported_identifiers !== undefined, `no exported_identifiers in ${json_path}`);
    assert(json.context !== undefined, `no exported_identifiers in ${json_path}`);
    assert(json.imports);
    const imported_modules = await Promise.all(
      (json.imports as { pkg: { name: string; version: string }; pkg_relative_path: string }[]).map(
        (x) => {
          const {
            pkg: { name, version },
            pkg_relative_path,
          } = x;
          const pkg = this.library_manager.get_package(name, version);
          assert(pkg !== undefined);
          const path = join(pkg.dir, pkg_relative_path);
          const mod = this.library_manager.ensureUpToDate(path);
          return mod;
        },
      ),
    );
    if (imported_modules.some((x) => x.get_mtime() > json_mtime)) {
      this.state = { type: "stale", cid, pkg, pkg_relative_path };
      return;
    }
    this.imported_modules = imported_modules;
    imported_modules.forEach((x) => x.dependant_modules.push(this));
    console.log(`up to date ${cid}`);
    this.state = {
      type: "fresh",
      cid,
      pkg,
      pkg_relative_path,
      exported_identifiers: json.exported_identifiers,
      context: json.context,
      unit: json.unit,
      mtime: json_mtime,
    };
  }

  async initialize() {
    switch (this.state.type) {
      case "initial": {
        const promise = this.do_initialize();
        this.state = { type: "initializing", promise };
        return promise;
      }
      case "initializing":
        return this.state.promise;
    }
  }

  async do_recompile() {
    const state = this.state;
    assert(state.type === "stale");
    console.log(`recompiling ${state.cid} ...`);
    const code = await fs.readFile(this.path, { encoding: "utf-8" });
    const my_pkg = state.pkg;
    const my_path = state.pkg_relative_path;
    const source_file: source_file = {
      package: { name: my_pkg.name, version: my_pkg.version },
      path: my_path,
    };
    const [_loc0, expand] = initial_step(parse(code, source_file), state.cid, this.libs);
    try {
      const helpers: preexpand_helpers = {
        manager: {
          resolve_import: async (loc) => {
            assert(loc.t.tag === "string");
            const import_path = JSON.parse(loc.t.content);
            const mod = this.get_imported_modules_for_path(import_path, loc);
            return mod;
          },
          resolve_label: async (label) => {
            const mod = this.find_module_by_cid(label.cuid);
            if (!mod) throw new Error(`cannot find module with cuid = ${label.cuid}`);
            return mod.resolve_label(label.name);
          },
          get_import_path: async (cuid) => {
            const mod = this.find_module_by_cid(cuid);
            if (!mod) throw new Error(`cannot find module with cuid = ${cuid}`);
            const [mod_pkg, mod_path] = mod.get_pkg_and_path();
            if (mod_pkg === my_pkg) {
              const dir0 = join(dirname(my_path), ".rts");
              const dir1 = join(dirname(mod_path), ".rts");
              if (dir0 !== dir1) throw new Error(`TODO relative path imports`);
              return `./${basename(mod_path)}.ts`;
            } else {
              throw new Error(`TODO cross package imports`);
            }
          },
          resolve_rib: (rib_id, cuid) => {
            const mod = this.find_module_by_cid(cuid);
            if (!mod) throw new Error(`cannot find module with cuid = ${cuid}`);
            return mod.resolve_rib(rib_id);
          },
        },
        global_unit: this.global_unit,
        global_context: this.global_context,
        inspect(_loc, _reason, k) {
          return k();
        },
      };
      const { loc, unit, context, modular } = await expand(helpers);
      assert(modular.extensible);
      const proxy_code = generate_proxy_code(
        this.get_generated_code_relative_path(),
        modular,
        context,
      );
      const exported_identifiers = get_exported_identifiers_from_rib(
        modular.explicit,
        state.cid,
        context,
      );
      const json_content = {
        cid: state.cid,
        cookie,
        imports: this.imported_modules.map((x) => {
          const [pkg, path] = x.get_pkg_and_path();
          return { pkg: { name: pkg.name, version: pkg.version }, pkg_relative_path: path };
        }),
        exported_identifiers,
        context,
        unit,
      };
      const code_path = this.get_generated_code_absolute_path();
      await fs.mkdir(dirname(code_path), { recursive: true });
      await fs.writeFile(code_path, await pprint(loc));
      await fs.writeFile(this.get_proxy_path(), proxy_code);
      const mtime = Date.now();
      await fs.writeFile(this.get_json_path(), stringify(json_content));
      this.state = { ...state, type: "fresh", ...json_content, mtime };
      console.log(`up to date ${state.cid}`);
    } catch (error) {
      this.state = { type: "error", reason: String(error) };
      if (error instanceof StxError) {
        await print_stx_error(error, this.library_manager);
      } else {
        console.error(error);
      }
    }
  }

  async recompile() {
    const state = this.state;
    switch (state.type) {
      case "stale": {
        const promise = this.do_recompile();
        this.state = { ...state, type: "compiling", promise };
        return promise;
      }
      case "compiling":
        return state.promise;
    }
  }

  async force_recompile() {
    const state = this.state;
    await this.ensureUpToDate();
    assert(state.type === "fresh");
    this.state = { ...state, type: "stale" };
    const dependant_modules = this.dependant_modules;
    dependant_modules.forEach(
      (x) => (x.imported_modules = x.imported_modules.filter((x) => x !== this)),
    );
    this.dependant_modules = [];
    this.imported_modules.forEach(
      (x) => (x.dependant_modules = x.dependant_modules.filter((x) => x !== this)),
    );
    this.imported_modules = [];
    dependant_modules.forEach((x) => x.force_recompile());
    this.ensureUpToDate();
  }

  async file_changed(): Promise<void> {
    const t = await mtime(this.path);
    await this.ensureUpToDate();
    const state = this.state;
    switch (state.type) {
      case "fresh": {
        if (t && t > state.mtime) {
          this.force_recompile();
        }
        return;
      }
      default:
        throw new Error(`invalid state? '${state.type}'`);
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

  get_cid(): string {
    switch (this.state.type) {
      case "fresh":
      case "stale":
      case "compiling":
        return this.state.cid;
      default:
        throw new Error(`invalid state ${this.state.type}`);
    }
  }

  get_mtime(): number {
    switch (this.state.type) {
      case "fresh":
        return this.state.mtime;
      default:
        throw new Error(`invalid state`);
    }
  }

  find_module_by_cid(cid: string): imported_module | undefined {
    if (this.get_cid() === cid) return this;
    for (const m of this.imported_modules) {
      const r = m.find_module_by_cid(cid);
      if (r) return r;
    }
    return undefined;
  }

  async resolve_label(name: string): Promise<Binding> {
    assert(this.state.type === "fresh");
    const context = this.state.context;
    const binding = context[name];
    switch (binding.type) {
      case "lexical":
        return { type: "imported_lexical", cuid: this.state.cid, name: binding.name };
      case "type":
        return { type: "imported_type", cuid: this.state.cid, name: binding.name };
      case "syntax_rules_transformer":
        return {
          type: "imported_syntax_rules_transformer",
          cuid: this.state.cid,
          clauses: binding.clauses,
        };
      default:
        throw new Error(`unhandled binding type ${binding.type}`);
    }
  }

  get_pkg_and_path(): [{ name: string; version: string }, string] {
    assert(this.state.type === "fresh");
    return [this.state.pkg, this.state.pkg_relative_path];
  }

  private async get_imported_modules_for_path(
    import_path: string,
    loc: Loc,
  ): Promise<imported_module> {
    const mod = this.library_manager.do_import(import_path, this.path);
    if (this.imported_modules.includes(mod)) return mod;
    const self = this;
    function check(mod: imported_module) {
      if (mod === self) {
        syntax_error(loc, `circular import`);
      }
      mod.imported_modules.forEach(check);
    }
    check(mod);
    this.imported_modules.push(mod);
    mod.dependant_modules.push(self);
    return mod;
  }

  resolve_rib(rib_id: string): Rib {
    assert(this.state.type === "fresh");
    const unit = this.state.unit;
    const rib = unit.store[rib_id];
    assert(rib !== undefined);
    return rib;
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

type watcher = {
  close: () => void;
};

type host = {
  watchFile: (path: string, callback: (path: string) => void) => watcher;
};

export class LibraryManager {
  private libs: string[];
  private global_unit: CompilationUnit;
  private global_context: Context;
  private modules: { [path: string]: imported_module } = {};
  private packages: { [dir: string]: Package } = {};
  private host: host;

  constructor(patterns: { [k: string]: AST }, globals: string[], libs: string[], host: host) {
    this.libs = libs;
    this.host = host;
    const [global_unit, global_context] = init_global_context(patterns, globals);
    this.global_unit = global_unit;
    this.global_context = global_context;
  }

  private get_or_create_module(path: string) {
    const existing = this.modules[path];
    if (existing) return existing;
    const mod = new RtsModule(path, this, this.libs, this.global_unit, this.global_context);
    this.modules[path] = mod;
    const watcher = this.host.watchFile(path, (p) => {
      if (p !== path) return;
      mod.file_changed();
    });
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
