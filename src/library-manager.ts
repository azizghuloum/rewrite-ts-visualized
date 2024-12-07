/* */

import { assert } from "./assert.ts";
import fs from "node:fs/promises";
import { dirname, basename, join } from "node:path";

type library_state = { type: "initial" } | { type: "initializing" };

class Library {
  private path: string;
  private library_manager: LibraryManager;

  private state: library_state = { type: "initial" };

  constructor(path: string, library_manager: LibraryManager) {
    this.path = path;
    this.library_manager = library_manager;
  }

  ensureUpToDate() {
    switch (this.state.type) {
      case "initial": {
        this.initialize();
      }
    }
  }

  async initialize() {
    assert(this.state.type === "initial");
    this.state = { type: "initializing" };
    console.log("initializing ...");
    const [pkg, base] = await this.library_manager.findPackage(this.path);
    const cid = `${base} ${pkg.name} ${pkg.version}`;
    console.log({ cid });
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
  private libs: { [path: string]: Library } = {};
  private packages: { [dir: string]: Package } = {};

  ensureUpToDate(path: string) {
    const lib = (this.libs[path] ??= new Library(path, this));
    lib.ensureUpToDate();
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
