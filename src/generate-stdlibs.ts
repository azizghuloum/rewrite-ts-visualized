import TS from "typescript";
import fs from "node:fs/promises";
import { pretty_print } from "./pprint";
import stringify from "json-stable-stringify";

const libdir = "./node_modules/typescript/lib";

type btype = "value" | "type" | "interface" | "class" | "module" | "include";

type libs = { [k: string]: { [k in btype]?: string[] } };

async function get_libs(start: string) {
  const seen: string[] = [];
  const libs: libs = {};

  function dobinding(name: string | undefined, type: btype, libname: string) {
    if (name === undefined) {
      throw new Error(`name of ${type} is undefined in ${libname}`);
    }
    const lib = libs[libname] || (libs[libname] = {});
    const ls = lib[type] || (lib[type] = []);
    ls.push(name);
  }

  function dostmt(stmt: TS.Statement, libname: string) {
    switch (stmt.kind) {
      case TS.SyntaxKind.InterfaceDeclaration: {
        const x = stmt as TS.InterfaceDeclaration;
        dobinding(x.name.text, "interface", libname);
        return;
      }
      case TS.SyntaxKind.TypeAliasDeclaration: {
        const x = stmt as TS.TypeAliasDeclaration;
        dobinding(x.name.text, "type", libname);
        return;
      }
      case TS.SyntaxKind.VariableStatement: {
        const x = stmt as TS.VariableStatement;
        const decls = x.declarationList.declarations;
        decls.forEach((x) => {
          switch (x.name.kind) {
            case TS.SyntaxKind.Identifier: {
              dobinding(x.name.text, "value", libname);
              return;
            }
            default:
              throw new Error("unhandled variable declaration");
          }
        });
        return;
      }
      case TS.SyntaxKind.ModuleDeclaration: {
        const x = stmt as TS.ModuleDeclaration;
        const name = x.name;
        switch (name.kind) {
          case TS.SyntaxKind.Identifier: {
            dobinding(x.name.text, "module", libname);
            return;
          }
          default:
            throw new Error("unhandled module declaration");
        }
      }
      case TS.SyntaxKind.FunctionDeclaration: {
        const x = stmt as TS.FunctionDeclaration;
        dobinding(x.name?.text, "value", libname);
        return;
      }
      case TS.SyntaxKind.ClassDeclaration: {
        const x = stmt as TS.ClassDeclaration;
        dobinding(x.name?.text, "class", libname);
        return;
      }
      default:
        throw new Error(`unknown ${TS.SyntaxKind[stmt.kind]} in ${libname}`);
    }
  }

  async function readit(libname: string): Promise<unknown> {
    if (seen.includes(libname)) return;
    seen.push(libname);
    libs[libname] = {};
    const content = await fs.readFile(`${libdir}/lib.${libname}.d.ts`, {
      encoding: "utf8",
    });
    const src = TS.createSourceFile("test.ts", content, {
      languageVersion: TS.ScriptTarget.ESNext,
    });
    src.statements.forEach((x) => dostmt(x, libname));
    return Promise.all(
      src.libReferenceDirectives.map((x) => {
        return Promise.all([readit(x.fileName), dobinding(x.fileName, "include", libname)]);
      }),
    );
  }

  async function get_libs(start: string) {
    await readit(start);
    return libs;
  }

  return await get_libs(start);
}

export async function generate_libs_file(start: string) {
  const libs = await get_libs(start);
  const file = `

/* this file is automatically generated.  do not edit. */

/* one more reason why macros are needed */

type btype = "value" | "type" | "interface" | "class" | "module" | "include";

type libs = { [k: string]: { [k in btype]?: string[] } };

export const stdlibs:libs = ${stringify(libs)};

`;
  return pretty_print(file);
}