#!/usr/bin/env deno --allow-all

// yeah, no, not gonna work
//
import TS from "typescript";

const src = TS.createSourceFile("test.ts", "const foo = null;", {
  languageVersion: TS.ScriptTarget.ESNext,
});

const t1 = TS.factory.createTypeAliasDeclaration(
  [TS.factory.createToken(TS.SyntaxKind.ExportKeyword)],
  "foo",
  undefined,
  TS.factory.createLiteralTypeNode(TS.factory.createNull()),
);

const lit1 = TS.factory.createNumericLiteral("1");
const t2 = TS.factory.createExpressionStatement(
  TS.factory.createAsExpression(lit1, TS.factory.createLiteralTypeNode(TS.factory.createNull())),
);

const lit2 = TS.factory.createNumericLiteral("2");
const add = TS.factory.createAdd(lit1, lit2);
const exprstmt = TS.factory.createExpressionStatement(add);
const finalsrc = TS.factory.createSourceFile(
  [t1, t2, exprstmt],
  TS.factory.createToken(TS.SyntaxKind.EndOfFileToken),
  TS.NodeFlags.None,
);

const src1 = TS.createSourceMapSource("foo.txt", "some context");
const src2 = TS.createSourceMapSource("bar.txt", "some other context");
TS.setSourceMapRange(lit1, { pos: 5, end: 20, source: src1 });
TS.setSourceMapRange(lit2, { pos: 0, end: 4, source: src2 });
TS.setSourceMapRange(finalsrc, { pos: 5, end: 20, source: src1 });
finalsrc.fileName = "mysrc.ts";

const printer = TS.createPrinter();
console.log(printer.printFile(src));

//const ac: string[] = [];
//
//const ep = printer.writeFile(
//  finalsrc,
//  {
//    writeLine: (args: any) => {
//      ac.push("\n");
//      console.log({ writeLine: args });
//    },
//    writeKeyword: (args: any) => {
//      ac.push(args);
//      console.log({ writeKeyword: args });
//    },
//    writeSpace: (args: any) => {
//      ac.push(args);
//      console.log({ writeSpace: args });
//    },
//    writePunctuation: (args: any) => {
//      ac.push(args);
//      console.log({ writePunctuation: args });
//    },
//    writeTrailingSemicolon: (args: any) => {
//      ac.push(args);
//      console.log({ writeTrailingSemicolon: args });
//    },
//    writeStringLiteral: (args: any) => {
//      ac.push(args);
//      console.log({ writeStringLiteral: args });
//    },
//    writeOperator: (args: any) => {
//      ac.push(args);
//      console.log({ writeOperator: args });
//    },
//    write: (args: any) => {
//      ac.push(args);
//      console.log({ write: args });
//    },
//    getLine: (args: any) => {
//      console.log({ getLine: args });
//      return 10;
//    },
//    getColumn: (args: any) => {
//      console.log({ getColumn: args });
//      return 17;
//    },
//  },
//  {
//    addSource: (...args: any) => {
//      console.log({ addSource: args });
//    },
//    addMapping: (...args: any) => {
//      console.log({ addMapping: args });
//    },
//  },
//  //(...args: any) => {
//  //  console.log({ srcmap: args });
//  //},
//);
//
//console.log({ ep });
////console.log(printer.printNode(TS.EmitHint.SourceFile, finalsrc, finalsrc));

const host1: TS.CompilerHost = TS.createCompilerHost({});

const files = {
  "foo.rts":
    "import * as b from './bar.r'; export const t = 18;\nconst foobar2: string | null = 'hello';",
  "/Users/aghuloum/Projects/rewrite-ts-visualized/bar.r.ts": "export const t = 18;\n",
};

const host: TS.CompilerHost = {
  getSourceFile(fileName, languageVersionOrOptions) {
    console.log(`getSourceFile ${fileName}`);
    if (files[fileName] === undefined)
      return host1.getSourceFile(fileName, languageVersionOrOptions);
    if (fileName === "foo.r.ts") {
      //prog.getSourceFile("bar.r.ts");
    }
    const src = TS.createSourceFile(
      fileName,
      files[fileName],
      languageVersionOrOptions,
      undefined,
      TS.ScriptKind.TSX,
    );
    return src;
  },
  getDefaultLibFileName(options) {
    return host1.getDefaultLibFileName(options);
  },
  fileExists(fileName) {
    console.log(`fileexists ${fileName}`);
    if (files[fileName]) return true;
    return host1.fileExists(fileName);
  },
  writeFile(filename, text, writebom, onerror, sourcefiles, data) {
    throw new Error("writefile");
  },
  getCurrentDirectory() {
    return host1.getCurrentDirectory();
  },
  getCanonicalFileName(fileName) {
    if (files[fileName]) return fileName;
    return host1.getCanonicalFileName(fileName);
  },
  getNewLine() {
    throw new Error("getNewLine");
  },
  readFile(fileName) {
    if (files[fileName]) {
      return files[fileName];
    } else {
      return host1.readFile(fileName);
    }
  },
  useCaseSensitiveFileNames() {
    return host1.useCaseSensitiveFileNames();
  },
};

const prog = TS.createProgram({
  options: {
    sourceMap: true,
    declaration: true,
    declarationMap: true,
    //allowArbitraryExtensions: true,
    target: TS.ScriptTarget.ES2020,
  },
  rootNames: ["foo.r"],
  host,
});

const foo = prog.getSourceFile("foo.r.ts");
//console.log(foo);

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
const diags = prog.getSemanticDiagnostics(foo);
diags.forEach((diag) => {
  const start = diag.start || 0;
  const length = diag.length || 10;
  const text = diag.file?.getFullText().substring(start, start + length);
  console.log({ message: diag.messageText, text, file: diag.file?.fileName });
});

console.log({
  global: prog.getGlobalDiagnostics(),
  options: prog.getOptionsDiagnostics(),
  semantic: prog.getSemanticDiagnostics(),
  syntactic: prog.getSyntacticDiagnostics(),
  declaration: prog.getDeclarationDiagnostics(),
});
