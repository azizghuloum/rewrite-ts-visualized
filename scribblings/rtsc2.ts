#!/usr/bin/env deno --allow-all

import TS from "typescript";

function make_example1() {
  return TS.createSourceFile("test.ts", "export type foo = number;\n", {
    languageVersion: TS.ScriptTarget.ES2020,
  });
}

function make_example2() {
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

  return finalsrc;
}

const example = make_example1();
const printer = TS.createPrinter();
console.log(printer.printFile(example));

const prog = TS.createProgram({
  options: {
    sourceMap: true,
    declaration: true,
    declarationMap: true,
    target: TS.ScriptTarget.ES2020,
  },
  rootNames: [],
});

const results = prog.emit(
  example,
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
