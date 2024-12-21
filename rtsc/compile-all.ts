import { FSWatcher, watch } from "node:fs";
import fs from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import ignore from "ignore";

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

const FS = new WatchFS((path) => console.log({ path }));

//console.log(path.relative("/x/a/b/c", "/x/a/b2/c2"));

//const watcher = watch(".", {}, (event, filename) => console.log({ event, filename }));
