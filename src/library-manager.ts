import { assert } from "./assert";
import fs from "node:fs/promises";
import { dirname, basename, join, relative } from "node:path";
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
  exported_identifiers,
} from "./preexpand-helpers";
import { AST, source_file } from "./ast";
import { normalize } from "node:path";
import { Binding, CompilationUnit, Context, Loc, Rib } from "./syntax-structures";
import stringify from "json-stringify-pretty-compact";
import { init_global_context } from "./global-module";
import { parse_dts } from "./parse-dts";

const cookie = "rewrite-ts-019";

type module_state =
  | { type: "initial" }
  | { type: "initializing"; promise: Promise<void> }
  | { type: "stale"; cid: string }
  | {
      type: "compiling";
      cid: string;
      promise: Promise<void>;
    }
  | {
      type: "fresh";
      cid: string;
      exported_identifiers: { [name: string]: import_resolution[] };
      context: Context;
      unit: CompilationUnit;
      mtime: number;
    }
  | { type: "error"; reason: string };

abstract class Module implements imported_module {
  pkg: Package;
  pkg_relative_path: string;
  path: string;
  library_manager: LibraryManager;
  state: module_state = { type: "initial" };
  libs: string[];
  global_unit: CompilationUnit;
  global_context: Context;
  imported_modules: imported_module[] = [];
  dependant_modules: imported_module[] = [];

  abstract do_recompile(): Promise<void>;

  constructor(
    pkg: Package,
    pkg_relative_path: string,
    path: string,
    library_manager: LibraryManager,
    libs: string[],
    global_unit: CompilationUnit,
    global_context: Context,
  ) {
    this.pkg = pkg;
    this.pkg_relative_path = pkg_relative_path;
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

  get_json_path(): string {
    return join(dirname(this.path), ".rts", basename(this.path) + ".json");
  }

  private async do_initialize() {
    assert(this.state.type === "initial", `invalid state ${this.state.type}`);
    const [pkg, pkg_relative_path] = await this.library_manager.findPackage(this.path);
    const cid = `${pkg_relative_path} ${pkg.name} ${pkg.version}`;
    console.log(`initializing ${cid}`);
    const json_path = this.get_json_path();
    const json_mtime = await mtime(json_path);
    const my_mtime = await mtime(this.path);
    assert(my_mtime !== undefined, `no mtime for '${this.path}'`);
    if (json_mtime === undefined || my_mtime >= json_mtime) {
      this.state = { type: "stale", cid };
      return;
    }
    const json = JSON.parse(await fs.readFile(json_path, { encoding: "utf8" }));
    if (json.cookie !== cookie) {
      this.state = { type: "stale", cid };
      return;
    }
    assert(json.cid === cid);
    assert(json.exported_identifiers !== undefined, `no exported_identifiers in ${json_path}`);
    assert(json.context !== undefined, `no exported_identifiers in ${json_path}`);
    assert(json.imports);
    const imported_modules = await Promise.all(
      (json.imports as { pkg: { name: string; version: string }; pkg_relative_path: string }[]).map(
        async (x) => {
          const {
            pkg: { name, version },
            pkg_relative_path,
          } = x;
          const pkg = await this.library_manager.load_package(name, version, this.path);
          assert(pkg !== undefined, `failed to get package '${name}:${version}'`);
          const path = normalize(join(pkg.dir, pkg_relative_path));
          const mod = this.library_manager.ensureUpToDate(pkg, pkg_relative_path, path);
          return mod;
        },
      ),
    );
    if (imported_modules.some((x) => x.get_mtime() > json_mtime)) {
      this.state = { type: "stale", cid };
      return;
    }
    this.imported_modules = imported_modules;
    imported_modules.forEach((x) => x.dependant_modules.push(this));
    console.log(`up to date ${cid}`);
    this.state = {
      type: "fresh",
      cid,
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
    await Promise.all(dependant_modules.map((x) => x.force_recompile()));
    await this.ensureUpToDate();
  }

  async file_changed(): Promise<void> {
    const t = await mtime(this.path);
    await this.ensureUpToDate();
    const state = this.state;
    switch (state.type) {
      case "fresh": {
        if (t && t > state.mtime) {
          await this.force_recompile();
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
        throw new Error(`invalid state for '${this.path}'`);
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
    if (!binding) throw new Error(`binding missing for ${name} in ${this.path}`);
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
      case "imported_type":
      case "imported_lexical":
        return binding;
      default:
        throw new Error(`unhandled binding type ${binding.type} for label '${name}'`);
    }
  }

  get_pkg_and_path(): [
    {
      name: string;
      version: string;
      reverse_resolve(path: string): string;
    },
    string,
  ] {
    return [this.pkg, this.pkg_relative_path];
  }

  async get_imported_modules_for_path(import_path: string, loc: Loc): Promise<imported_module> {
    const mod = await this.library_manager.do_import(import_path, this.path, this.pkg);
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

  get_preexpand_helpers(my_pkg: Package, my_path: string): preexpand_helpers {
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
            return mod_pkg.reverse_resolve(mod_path);
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
    return helpers;
  }
}

class RtsModule extends Module {
  private get_generated_code_absolute_path(): string {
    return join(dirname(this.path), ".rts", basename(this.path) + ".ts");
  }

  private get_generated_code_relative_path(): string {
    return "./.rts/" + basename(this.path) + ".ts";
  }

  private get_proxy_path(): string {
    return this.path + ".ts";
  }

  async do_recompile() {
    const state = this.state;
    assert(state.type === "stale");
    console.log(`recompiling ${state.cid} ...`);
    const code = await fs.readFile(this.path, { encoding: "utf-8" });
    const my_pkg = this.pkg;
    const my_path = this.pkg_relative_path;
    const source_file: source_file = {
      package: { name: my_pkg.name, version: my_pkg.version },
      path: my_path,
    };
    const [_loc0, expand] = initial_step(parse(code, source_file, state.cid), state.cid, this.libs);
    try {
      const helpers = this.get_preexpand_helpers(my_pkg, my_path);
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
      await fs.writeFile(code_path, await pprint(loc, false));
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
}

class DtsModule extends Module {
  async do_recompile() {
    const state = this.state;
    assert(state.type === "stale");
    console.log(`recompiling ${state.cid} ...`);
    const my_path = this.pkg_relative_path;
    const dts_mtime = await mtime(this.path);
    assert(dts_mtime !== undefined, `error reading mtime of ${this.path}`);
    const code = await fs.readFile(this.path, { encoding: "utf-8" });
    const ts_exports = parse_dts(code, my_path, this.path);
    const cid = state.cid;
    const rib: Rib = { type: "rib", types_env: {}, normal_env: {} };
    const unit: CompilationUnit = {
      cu_id: cid,
      store: { r0: rib },
    };
    const unique_imports: { [k: string]: boolean } = {};
    for (const x of Object.values(ts_exports)) {
      if (x.type === "imported") {
        const module_name = x.module;
        unique_imports[module_name] = true;
      }
    }
    for (const module_name of Object.keys(unique_imports)) {
      const mod = await this.library_manager.do_import(module_name, this.path, this.pkg);
      if (!this.imported_modules.includes(mod)) {
        this.imported_modules.push(mod);
      }
    }
    const context: Context = {};
    const export_entries: [string, import_resolution[]][] = Object.entries(ts_exports).map(
      ([name, binding]) => {
        switch (binding.type) {
          case "local": {
            const res: import_resolution[] = [];
            if (binding.is_type) {
              const label = `t.${binding.name}`;
              context[label] = { type: "type", name };
              res.push({ type: "type", label: { cuid: cid, name: label } });
            }
            if (binding.is_lexical) {
              const label = `l.${binding.name}`;
              context[label] = { type: "lexical", name };
              res.push({ type: "lexical", label: { cuid: cid, name: label } });
            }
            return [name, res];
          }
          case "imported": {
            const label = `e.${binding.name}.${binding.module}`;
            //assert(binding.name !== undefined, `namespace reexports not handled yet`);
            if (binding.name) {
              context[label] = {
                type: "imported_lexical",
                cuid: binding.module,
                name: binding.name,
              };
            } else {
              console.error(`nameless reexports not handled yet`);
            }
            const res: import_resolution = {
              type: "ts",
              label: { cuid: cid, name: label },
            };
            return [name, [res]];
          }
          default:
            const invalid: never = binding;
            throw invalid;
        }
      },
    );
    const exported_identifiers: exported_identifiers = Object.fromEntries(export_entries);
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
    //console.log(json_content);
    // const json_path = this.get_json_path();
    // await fs.mkdir(dirname(json_path), { recursive: true });
    //const mtime = Date.now();
    // await fs.writeFile(this.get_json_path(), stringify(json_content));
    this.state = { ...state, type: "fresh", ...json_content, mtime: dts_mtime };
    console.log(`up to date ${state.cid}`);
  }
}

type package_props = {
  types?: string;
  main?: string;
  exports?: { [k: string]: string | { types?: string } };
};

class Package {
  name: string;
  version: string;
  dir: string;
  props: package_props;

  constructor(name: string, version: string, dir: string, props?: package_props) {
    this.name = name;
    this.version = version;
    this.dir = dir;
    this.props = props ?? {};
  }

  reverse_resolve(path: string): string {
    if (path === this.props.types) return this.name;
    throw new Error(`reverse resolving ${path} in '${this.name}'`);
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

  get_or_create_module(pkg: Package, pkg_relative_path: string, path: string) {
    const existing = this.modules[path];
    if (existing) return existing;
    const mod = (() => {
      if (path.endsWith(".rts")) {
        return new RtsModule(
          pkg,
          pkg_relative_path,
          path,
          this,
          this.libs,
          this.global_unit,
          this.global_context,
        );
      } else if (path.endsWith(".d.ts") || path.endsWith(".d.cts") || path.endsWith(".js")) {
        return new DtsModule(
          pkg,
          pkg_relative_path,
          path,
          this,
          this.libs,
          this.global_unit,
          this.global_context,
        );
      } else {
        throw new Error(`don't know how to import ${path}`);
      }
    })();
    this.modules[path] = mod;
    this.host.watchFile(path, (p) => {
      if (p !== path) return;
      mod.file_changed();
    });
    return mod;
  }

  async ensureUpToDate(pkg: Package, pkg_relative_path: string, path: string) {
    const mod = this.get_or_create_module(pkg, pkg_relative_path, path);
    await mod.ensureUpToDate();
    return mod;
  }

  get_package(name: string, version: string): Package | undefined {
    return Object.values(this.packages).find((x) => x.name === name && x.version === version);
  }

  async load_package(name: string, version: string, importing_path: string): Promise<Package> {
    const existing = this.get_package(name, version);
    if (existing) return existing;
    const pkg = await this.resolve_node_module_package(name, dirname(importing_path));
    assert(
      pkg.version === version,
      `package version mismatch; expected ${version}, found ${pkg.version}`,
    );
    return pkg;
  }

  async findPackage(path: string): Promise<[Package, string]> {
    const base = basename(path);
    const pkg_dir = dirname(path);
    const existing = this.packages[pkg_dir];
    if (existing) return [existing, base];
    const pkg_path = join(pkg_dir, "package.json");
    try {
      const content = await fs.readFile(pkg_path, { encoding: "utf8" });
      const json = JSON.parse(content);
      const { name, version } = json;
      assert(typeof name === "string");
      assert(typeof version === "string");
      return [(this.packages[pkg_dir] ??= new Package(name, version, pkg_dir)), base];
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        const [pkg, pkg_base] = await this.findPackage(pkg_dir);
        return [pkg, join(pkg_base, base)];
      } else {
        throw err;
      }
    }
  }

  async resolve_node_module_package(pkg_name: string, dir: string): Promise<Package> {
    const pkg_dir = `${dir}/node_modules/${pkg_name}`;
    assert(dir !== "/");
    const existing = this.packages[pkg_dir];
    if (existing) return existing;
    const pkg_path = join(pkg_dir, "package.json");
    try {
      const content = await fs.readFile(pkg_path, { encoding: "utf8" });
      const json = JSON.parse(content);
      const { name, version, types, main, exports } = json;
      assert(name === pkg_name);
      assert(typeof version === "string");
      return (this.packages[pkg_dir] ??= new Package(pkg_name, version, pkg_dir, {
        main,
        types,
        exports,
      }));
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return this.resolve_node_module_package(pkg_name, dirname(dir));
      } else {
        throw err;
      }
    }
  }

  async do_import(import_path: string, importer_path: string, importer_pkg: Package) {
    function is_relative(path: string): boolean {
      return path.startsWith("./") || path.startsWith("../");
    }
    function join_relative(import_path: string, importer_path: string): string {
      const path = dirname(importer_path) + "/" + import_path;
      return normalize(path);
    }
    function is_scoped(path: string): boolean {
      return path.startsWith("@");
    }
    type T = (path: string) => Promise<[Package, string, string]>;
    const find_relative_path: T = async (import_path: string) => {
      const absolute_path = join_relative(import_path, importer_path);
      const pkg_relative_path = relative(importer_pkg.dir, absolute_path);
      return [importer_pkg, pkg_relative_path, absolute_path];
    };
    const find_normal_path: T = async (import_path: string) => {
      const [pkg_name, ...import_parts] = import_path.split("/");
      const pkg = await this.resolve_node_module_package(pkg_name, dirname(importer_path));
      if (import_parts.length !== 0) throw new Error(`TODO import parts`);
      if (pkg.props.types) {
        return [pkg, pkg.props.types, normalize(pkg.dir + "/" + pkg.props.types)];
      } else if (pkg.props.main) {
        return [pkg, pkg.props.main, normalize(pkg.dir + "/" + pkg.props.main)];
      } else {
        throw new Error(`cannot find main file in ${pkg.dir}`);
      }
    };
    const find_scoped_path: T = async (import_path: string) => {
      const [scope_name, scoped_name, ...import_parts] = import_path.split("/");
      const pkg_name = scope_name + "/" + scoped_name;
      const pkg = await this.resolve_node_module_package(pkg_name, dirname(importer_path));
      if (import_parts.length === 0) {
        assert(pkg.props.types !== undefined);
        return [pkg, pkg.props.types, normalize(pkg.dir + "/" + pkg.props.types)];
      } else {
        const p = "./" + import_parts.join("/");
        const entry = pkg.props.exports?.[p];
        if (entry === undefined) throw new Error(`cannot locate ${import_path} in ${pkg.dir}`);
        if (typeof entry === "string") throw new Error(`TODO export string in ${pkg.dir}`);
        const types_file = entry.types;
        if (types_file === undefined) throw new Error(`not types for ${import_path} in ${pkg.dir}`);
        const filepath = normalize(pkg.dir + "/" + types_file);
        return [pkg, types_file, filepath];
      }
    };
    const [module_pkg, module_pkg_relative_path, actual_path] = is_relative(import_path)
      ? await find_relative_path(import_path)
      : is_scoped(import_path)
        ? await find_scoped_path(import_path)
        : await find_normal_path(import_path);
    const mod = this.get_or_create_module(module_pkg, module_pkg_relative_path, actual_path);
    return mod;
  }
}
