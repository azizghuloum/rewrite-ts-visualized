#!/usr/local/bin/deno --allow-all --unstable-sloppy-imports

const watcher = Deno.watchFs(".");
for await (const event of watcher) {
  console.log(">>>> event", event);
  // { kind: "create", paths: [ "/foo.txt" ] }
}
