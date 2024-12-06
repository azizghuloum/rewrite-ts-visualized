#!/usr/bin/env deno --allow-all

import TS from "typescript";

const watch_reporter: TS.WatchStatusReporter = (diagnostics, newline, _options, error_count) => {
  console.log({ diagnostics, newline, error_count });
};

const watch_options: TS.WatchOptions = {};

const diagnostics_reporter: TS.DiagnosticReporter = (diagnostics) => {
  const {
    code,
    file: _file,
    length,
    category,
    messageText,
    start,
    relatedInformation,
    reportsDeprecated,
    reportsUnnecessary,
    source,
  } = diagnostics;
  console.log({
    code,
    length,
    category,
    messageText,
    start,
    relatedInformation,
    reportsDeprecated,
    reportsUnnecessary,
    source,
  });
};

const host: TS.WatchCompilerHostOfConfigFile<TS.BuilderProgram> = TS.createWatchCompilerHost(
  "./tsconfig.json",
  undefined,
  TS.sys,
  undefined,
  diagnostics_reporter,
  watch_reporter,
  watch_options,
  undefined,
);

host.readFile = (path, encoding) => {
  if (path.match(/\.rts\.ts$/)) {
    console.log({ readFile: path });
  }
  return TS.sys.readFile(path, encoding);
};

host.watchFile = (path, callback) => {
  //if (path.match(/\.rts\.ts$/)) {
  //console.log({ watchFile: path });
  //}
  if (!TS.sys.watchFile) throw new Error("system cannot watch");
  return TS.sys.watchFile(path, callback);
};

const dir_watchers: { [k: string]: TS.DirectoryWatcherCallback } = {};

host.watchDirectory = (path, callback, recursive, options) => {
  console.log({ in: "watchDirectory", path, recursive, options });
  if (!TS.sys.watchDirectory) throw new Error("system cannot watch");
  dir_watchers[path] = callback;
  return TS.sys.watchDirectory(path, callback, recursive, options);
};

const paths: { [k: string]: { queried: boolean } } = {};

function simulate_path_created(path: string) {
  console.log(`simulating path creation for ${path}`);
  const dir = path.replace(/\/[^\/]*$/, "");
  console.log(`directory: ${dir}`);
  const callback = dir_watchers[dir];
  console.log(`has_callback? ${callback !== undefined}`);
  callback(dir);
}

host.fileExists = (path) => {
  if (path.match(/\.d\.rts\.ts$/)) {
    if (!paths[path]) paths[path] = { queried: false };
    paths[path].queried = true;
    console.log(`path queried: ${path}`);
    setTimeout(() => {
      simulate_path_created(path);
    }, 2000);
    //if (timer === undefined) {
    //  timer = setInterval(() => {
    //    console.log(`timer firing on ${path}`);
    //
    //  }, 1000);
    //}
    console.log({ fileExists: path });
    return false;
  } else {
    return TS.sys.fileExists(path);
  }
};

const prog = TS.createWatchProgram(host);

//const x = prog.getSourceFile(host1.getCurrentDirectory() + "/test.r.ts");
//console.log(x);
//
//// this crashes
//const results = prog.emit(
//  undefined,
//  (name, text) => {
//    console.log({ name, text });
//  },
//  undefined,
//  undefined,
//  {},
//);
//
//console.log(results);
//console.log({
//  global: prog.getGlobalDiagnostics(),
//  options: prog.getOptionsDiagnostics(),
//  semantic: prog.getSemanticDiagnostics(),
//  syntactic: prog.getSyntacticDiagnostics(),
//  declaration: prog.getDeclarationDiagnostics(),
//});
