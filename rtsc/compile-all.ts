import { watch as node_watch } from "node:fs";
import fs from "node:fs/promises";
import process from "node:process";
import path, { basename, dirname, join } from "node:path";
import ignore from "ignore";
import * as commander from "commander";

import { LibraryManager } from "../src/library-manager.ts";
import { get_globals } from "../src/global-module.ts";
import { core_patterns } from "../src/syntax-core-patterns.ts";
import { parse } from "../src/parse.ts";
import { assert } from "../src/assert.ts";

type watch_proc = (
  path: string,
  callback: (file: string) => void,
) => {
  close(): void;
};

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
    const close = () => {
      assert(this.callbacks[filename] !== undefined, `no callback registered`);
      assert(this.callbacks[filename] === callback, `closing wrong watch`);
      delete this.callbacks[filename];
    };
    return { close };
  }
  processEvent(file: string) {
    this.onEvent?.(file);
    const callback = this.callbacks[file];
    if (callback) callback(join(this.dir, file));
  }
}

class WatchFS {
  dir_watchers: { [path: string]: DirWatcher } = {};
  onRTSFile: (path: string) => void;
  watch: watch_proc;
  constructor(watch: watch_proc, onRTSFile: (path: string) => void) {
    this.watch = watch;
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
    const watcher = new DirWatcher(abspath);
    this.dir_watchers[abspath] = watcher;
    this.watch(abspath, (file) => {
      watcher.processEvent(file);
    });
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
}

const program = new commander.Command();
program.option("-w, --watch", "watch files and directories for changes");
program.parse();
const options = program.opts();

const watch_proc: watch_proc = options.watch
  ? (path, callback) =>
      node_watch(path, { encoding: "utf8", recursive: false }, (_event, file) => {
        assert(file !== null);
        callback(file);
      })
  : (path, callback) => ({ close() {} });

const FS = new WatchFS(watch_proc, check_path);
