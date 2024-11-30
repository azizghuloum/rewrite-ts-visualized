#!/usr/bin/env deno --allow-all

import TS from "typescript";

function make_test() {
  return TS.createSourceFile("test.ts", "export type foo = number;\n", {
    languageVersion: TS.ScriptTarget.ES2020,
  });
}
function make_main() {
  return TS.createSourceFile("main.ts", "import * as t from './test.r';\n", {
    languageVersion: TS.ScriptTarget.ES2020,
  });
}

const host1 = TS.createCompilerHost({});
const host: TS.CompilerHost = {
  ...host1,
  readFile(filename) {
    //console.log({ in: "readFile", filename });
    return host1.readFile(filename);
  },
  writeFile(filename, text, bom, onerror, sourcefile, data) {
    console.log({ in: "writeFile", filename, text, bom, onerror, sourcefile, data });
    return host1.writeFile(filename, text, bom, onerror, sourcefile, data);
  },
  getSourceFile(filename, options, onerror, shouldcreate) {
    const getit = () => {
      switch (filename) {
        case "main.ts":
          return make_main();
        case host1.getCurrentDirectory() + "/test.r.ts":
          return make_test();
        default:
          return host1.getSourceFile(filename, options, onerror, shouldcreate);
      }
    };
    const answer = getit();
    //console.log({
    //  in: "getSourceFile",
    //  filename,
    //  options,
    //  onerror,
    //  shouldcreate,
    //  answer: !!answer,
    //});
    return answer;
  },
  fileExists(filename) {
    const getit = () => {
      switch (filename) {
        case "main.ts":
          return true;
        case host1.getCurrentDirectory() + "/test.r.ts":
          return true;
        default:
          return host1.fileExists(filename);
      }
    };
    const answer = getit();
    //console.log({ in: "fileExists", filename, answer });
    return answer;
  },
  getCanonicalFileName(fileName) {
    const answer = host1.getCanonicalFileName(fileName);
    //console.log({ in: "getCanonicalFileName", fileName, answer });
    return answer;
  },
  getSourceFileByPath(filename, path, options, onerror, shouldcreate) {
    console.log({ in: "getSourceFileByPath", filename, options, onerror, shouldcreate });
    return host1.getSourceFileByPath?.(filename, path, options, onerror, shouldcreate);
  },
  getDefaultLibFileName(options) {
    const answer = host1.getDefaultLibFileName(options);
    //console.log({ in: "getDefaultLibFileName", options, answer });
    return answer;
  },
  getCurrentDirectory() {
    //console.log({ in: "getCurrentDirectory" });
    return host1.getCurrentDirectory();
  },
  useCaseSensitiveFileNames() {
    const answer = host1.useCaseSensitiveFileNames();
    //console.log({ in: "useCaseSensitiveFileNames", answer });
    return answer;
  },
  getNewLine() {
    //console.log({ in: "getNewLine" });
    return host1.getNewLine();
  },
  getDefaultLibLocation() {
    const answer = host1.getDefaultLibLocation?.();
    //console.log({ in: "getDefaultLibLocation", answer });
    if (!answer) throw new Error("invalid");
    return answer;
  },
  directoryExists(dirname) {
    //console.log({ in: "directoryExists", dirname });
    const answer = host1.directoryExists?.(dirname);
    if (answer === undefined) throw new Error("invalid");
    return answer;
  },
  getDirectories(path) {
    const answer = host1.getDirectories?.(path);
    //console.log({ in: "getDirectories", path, answer });
    if (!answer) throw new Error("invalid");
    return answer;
  },
  getEnvironmentVariable(name) {
    const answer = host1.getEnvironmentVariable?.(name);
    //console.log({ in: "getEnvironmentVariable", name, answer });
    if (!answer) throw new Error("invalid");
    return answer;
  },
};

const system: TS.System = {
  args: [],
  createDirectory(path) {
    throw new Error("HERE");
  },
  directoryExists() {
    throw new Error("HERE");
  },
  exit() {
    throw new Error("HERE");
  },
  fileExists(path) {
    throw new Error("HERE");
  },
  getCurrentDirectory() {
    throw new Error("HERE");
  },
  getDirectories(path) {
    throw new Error("HERE");
  },
  getExecutingFilePath() {
    throw new Error("HERE");
  },
  newLine: "\n",
  readDirectory(path) {
    throw new Error("HERE");
  },
  readFile(path) {
    throw new Error("HERE");
  },
  resolvePath(path) {
    throw new Error("HERE");
  },
  useCaseSensitiveFileNames: false,
  write(path) {
    throw new Error("HERE");
  },
  writeFile(path, data) {
    throw new Error("HERE");
  },
};

const host2: TS.WatchCompilerHostOfFilesAndCompilerOptions<TS.BuilderProgram> =
  TS.createWatchCompilerHost([], {}, system, undefined, undefined, undefined, undefined, {});
const prog = TS.createProgram({
  options: {
    sourceMap: true,
    declaration: true,
    declarationMap: true,
    skipLibCheck: true,
    target: TS.ScriptTarget.ES2020,
  },
  rootNames: ["main.ts"],
  host: host,
});

const prog2 = TS.createWatchProgram(host2);

const x = prog.getSourceFile(host1.getCurrentDirectory() + "/test.r.ts");
console.log(x);

// this crashes
const results = prog.emit(
  undefined,
  (name, text) => {
    console.log({ name, text });
  },
  undefined,
  undefined,
  {},
);

console.log(results);
console.log({
  global: prog.getGlobalDiagnostics(),
  options: prog.getOptionsDiagnostics(),
  semantic: prog.getSemanticDiagnostics(),
  syntactic: prog.getSyntacticDiagnostics(),
  declaration: prog.getDeclarationDiagnostics(),
});
