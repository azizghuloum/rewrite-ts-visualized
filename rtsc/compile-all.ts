import { FSWatcher, watch } from "node:fs";
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
  private fswatcher: FSWatcher;
  constructor(fswatcher: FSWatcher) {
    this.fswatcher = fswatcher;
  }
}

class WatchFS {
  dir_watchers: { [path: string]: DirWatcher } = {};
  onRTSFile: (path: string) => void;
  constructor(onRTSFile: (path: string) => void) {
    this.onRTSFile = onRTSFile;
    this.init();
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
      const fswatcher = watch(abspath, { encoding: "utf8", recursive: false }, (event, file) => {
        console.log(`watch ${event} ${file} in ${abspath}`);
        if (file !== null) check_file(file, relpath, abspath);
      });
      this.dir_watchers[abspath] = new DirWatcher(fswatcher);
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
    const watcher = {
      close() {},
    };
    return watcher;
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
