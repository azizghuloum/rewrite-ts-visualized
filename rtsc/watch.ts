#!/usr/bin/env deno --allow-all

import { basename, dirname, join } from "node:path";
import TS from "typescript";
import { LibraryManager } from "../src/library-manager.ts";
import { get_globals } from "../src/global-module.ts";
import { core_patterns } from "../src/syntax-core-patterns.ts";
import { parse } from "../src/parse.ts";

const watch_reporter: TS.WatchStatusReporter = (diagnostics, _newline, _options, error_count) => {
  console.log(`rtsc: ${diagnostics.messageText}`);
  if (error_count) {
    console.log(`rtsc: error count: ${error_count}`);
  }
};

const watch_options: TS.WatchOptions = {};

const diagnostics_reporter: TS.DiagnosticReporter = (diagnostics) => {
  const {
    code,
    file: file,
    length,
    category,
    messageText,
    start,
    relatedInformation: _relatedInformation,
    reportsDeprecated,
    reportsUnnecessary,
    source,
  } = diagnostics;
  console.log({
    file: file?.fileName,
    code,
    length,
    category,
    messageText,
    start,
    //relatedInformation,
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

const fileExists = host.fileExists;
const readFile = host.readFile;
const watchFile = host.watchFile;
const watchDirectory = host.watchDirectory;

function check_path(path: string) {
  const suffix = ".rts.ts";
  if (path.endsWith(suffix)) {
    const module_dir = dirname(path);
    const module_name = basename(path, suffix) + ".rts";
    if (host.realpath === undefined) throw new Error("host has no real path");
    const rts_file = host.realpath(join(module_dir, module_name));
    if (fileExists(rts_file)) {
      library_manager.ensureUpToDate(rts_file);
    }
  }
}

host.fileExists = (path) => {
  check_path(path);
  return fileExists(path);
};

host.readFile = (path, encoding) => {
  check_path(path);
  return readFile(path, encoding);
};

host.watchFile = (path, callback, polling_interval, options) => {
  return watchFile(path, callback, polling_interval, options);
};

const dir_watchers: { [k: string]: TS.DirectoryWatcherCallback } = {};

host.watchDirectory = (path, callback, recursive, options) => {
  dir_watchers[path] = callback;
  return watchDirectory(path, callback, recursive, options);
};

const globals = get_globals("es2024.full");
const patterns = core_patterns(parse);
const library_manager = new LibraryManager(patterns, globals, ["es2024.full"], host);

const prog = TS.createWatchProgram(host);
