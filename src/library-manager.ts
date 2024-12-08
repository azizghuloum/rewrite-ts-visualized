import { assert } from "./assert";
import fs, { mkdir, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { mtime } from "./fs-helpers";
import { parse } from "./parse";
import { core_patterns } from "./syntax-core-patterns";
import { initial_step } from "./expander";
import { pprint } from "./pprint";
import { generate_proxy_code } from "./proxy-code";

type module_state =
  | { type: "initial" }
  | { type: "stale"; cid: string; pkg: Package }
  | { type: "fresh" }
  | { type: "error"; reason: string };

class Module {
  private path: string;
  private library_manager: LibraryManager;

  private state: module_state = { type: "initial" };

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
        return;
      default: {
        throw new Error(`ensureUpToDate: unhandled state type ${this.state.type}`);
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
    console.log("initializing ...");
    const [pkg, base] = await this.library_manager.findPackage(this.path);
    const cid = `${base} ${pkg.name} ${pkg.version}`;
    const json_path = this.get_json_path();
    const json_mtime = await mtime(json_path);
    const my_mtime = await mtime(this.path);
    assert(my_mtime !== undefined);
    //console.log({ cid, my_mtime, json_path });
    if (my_mtime >= (json_mtime ?? 0)) {
      this.state = { type: "stale", cid, pkg };
    } else {
      console.error("TODO: check dependencies");
      this.state = { type: "fresh" };
    }
  }

  async recompile() {
    assert(this.state.type === "stale");
    console.log(`expanding ${this.state.cid}`);
    const code = await fs.readFile(this.path, { encoding: "utf-8" });
    const patterns = core_patterns(parse);
    const [_loc0, expand] = initial_step(parse(code), this.state.cid, patterns);
    const { loc, unit: _unit, context, modular } = await expand((_loc, _reason, k) => k());
    const proxy_code = generate_proxy_code(
      this.get_generated_code_relative_path(),
      modular,
      context,
    );
    const json_content = { cid: this.state.cid };
    const code_path = this.get_generated_code_absolute_path();
    await mkdir(dirname(code_path), { recursive: true });
    await writeFile(code_path, await pprint(loc));
    await writeFile(this.get_proxy_path(), proxy_code);
    await writeFile(this.get_json_path(), JSON.stringify(json_content));
    this.state = { type: "fresh" };
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

  ensureUpToDate(path: string) {
    const mod = (this.modules[path] ??= new Module(path, this));
    mod.ensureUpToDate();
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
}
