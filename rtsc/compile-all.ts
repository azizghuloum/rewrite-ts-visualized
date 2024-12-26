import { watch } from "node:fs";
import fs from "node:fs/promises";
import process from "node:process";
import path, { basename, dirname, join } from "node:path";
import ignore from "ignore";

import { LibraryManager } from "../src/library-manager.ts";
import { get_globals } from "../src/global-module.ts";
import { core_patterns } from "../src/syntax-core-patterns.ts";
import { parse } from "../src/parse.ts";
import { assert } from "../src/assert.ts";

class DirWatcher {
  private dir: string;
  private callbacks: { [filename: string]: (path: string) => void } = {};
  public onEvent: ((file: string) => void) | undefined = undefined;
  constructor(dir: string) {
    this.dir = dir;
  }
  watchFile(path: string, callback: (path: string) => void): { close(): void } {
    assert(dirname(path) === this.dir);
    const filename = basename(path);
    assert(!this.callbacks[filename], `multiple watches for same path '${path}'`);
    this.callbacks[filename] = callback;
    return {
      close() {
        throw new Error(`close is not yet done`);
      },
    };
  }
  processEvent(event: "rename" | "change", file: string) {
    this.onEvent?.(file);
    const callback = this.callbacks[file];
    if (callback) callback(join(this.dir, file));
  }
}

class WatchFS {
  dir_watchers: { [path: string]: DirWatcher } = {};
  onRTSFile: (path: string) => void;
  constructor(onRTSFile: (path: string) => void) {
    this.onRTSFile = onRTSFile;
    this.init();
  }

  watchFile(path: string, callback: (path: string) => void): { close(): void } {
    const dir = dirname(path);
    const watcher = this.get_or_create_watcher(dir);
    return watcher.watchFile(path, callback);
  }

  private get_or_create_watcher(abspath: string): DirWatcher {
    const existing = this.dir_watchers[abspath];
    if (existing) return existing;
    const fswatcher = watch(abspath, { encoding: "utf8", recursive: false }, (event, file) => {
      assert(file !== null);
      watcher.processEvent(event, file);
    });
    const watcher = new DirWatcher(abspath);
    this.dir_watchers[abspath] = watcher;
    return watcher;
  }

  private async init() {
    const gitignore_content = await fs.readFile(".gitignore", { encoding: "utf8" });
    const ig = ignore().add(gitignore_content).add("/.git");

    async function getstat(absp: string) {
      try {
        return await fs.stat(absp);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          return null;
        } else {
          throw err;
        }
      }
    }

    const check_file = async (file: string, relpath: string, abspath: string) => {
      const relp = path.join(relpath, file);
      const absp = path.join(abspath, file);
      if (this.dir_watchers[absp]) return;
      if (ig.ignores(relp)) return;
      const stat = await getstat(absp);
      if (stat) {
        if (stat.isDirectory()) {
          seed_dir(relp, absp);
        } else if (file.endsWith(".rts")) {
          this.onRTSFile(absp);
        }
      }
    };

    const seed_dir = async (relpath: string, abspath: string) => {
      const watcher = this.get_or_create_watcher(abspath);
      assert(!watcher.onEvent);
      watcher.onEvent = (file) => check_file(file, relpath, abspath);
      fs.readdir(relpath).then((files) =>
        files.forEach((file) => check_file(file, relpath, abspath)),
      );
    };

    seed_dir(".", process.cwd());
  }
}

const globals = get_globals("es2024.full");
const patterns = core_patterns(parse);
const library_manager = new LibraryManager(patterns, globals, ["es2024.full"], {
  watchFile(path, callback) {
    return FS.watchFile(path, callback);
  },
});

function check_path(rts_file: string) {
  assert(rts_file.endsWith(".rts"));
  library_manager
    .findPackage(rts_file)
    .then(([pkg, rel]) => library_manager.ensureUpToDate(pkg, rel, rts_file));
  //const suffix = ".rts";
  //if (path.endsWith(suffix)) {
  //  const module_dir = dirname(path);
  //  const module_name = basename(path, suffix) + ".rts";
  //  const rts_file = join(module_dir, module_name);
  //  fs.stat(rts_file).then((stats) => {
  //    library_manager.ensureUpToDate(rts_file);
  //  });
  //}
}

const FS = new WatchFS(check_path);

//console.log(path.relative("/x/a/b/c", "/x/a/b2/c2"));

//const watcher = watch(".", {}, (event, filename) => console.log({ event, filename }));
