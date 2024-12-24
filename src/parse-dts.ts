import TS from "typescript";
import { assert } from "./assert";

function parse_statements(statements: TS.NodeArray<TS.Statement>) {
  // type id = ...
  const types: { [id: string]: { global: boolean } } = {};
  // const id = ...
  const lexicals: { [id: string]: { global: boolean } } = {};
  // import { id } from origin_module    or    import { origin_name as id } from origin_module
  const imported: {
    [id: string]: { global: boolean; origin_name: string; origin_module: string };
  } = {};
  // import * as id from origin_module     or    import id from origin_module
  const namespace_imported: { [id: string]: { global: boolean; origin_module: string } } = {};
  // module id { ... }
  const id_namespaces: { [id: string]: { global: boolean } } = {};
  // module "id" { ... }
  const literal_namespaces: { [id: string]: { global: boolean } } = {};
  // export { id }                       or    export { origin_name as id }                    or
  // export { id } from origin_module    or    export { origin_name as id } from origin_module
  const exported: {
    [id: string]: {
      global: boolean;
      type_only: boolean;
      origin_name: string;
      origin_module: string | undefined;
    };
  } = {};

  function handle_main_definition(global: boolean) {
    function push_lexical(name: string) {
      assert(!lexicals[name]);
      lexicals[name] = { global };
    }
    function push_type(name: string) {
      assert(!types[name]);
      types[name] = { global };
    }
    function push_imported(name: string, origin_name: string, origin_module: string) {
      assert(!imported[name]);
      imported[name] = { origin_name, origin_module, global };
    }
    function push_namespace_imported(name: string, origin_module: string) {
      assert(!namespace_imported[name]);
      namespace_imported[name] = { origin_module, global };
    }
    function push_exported(
      name: string,
      type_only: boolean,
      origin_name: string,
      origin_module: string | undefined,
    ) {
      assert(!exported[name], `duplicate export ${origin_name} as ${name}`);
      exported[name] = { type_only, origin_name, origin_module, global };
    }
    function push_namespace(name: string, literal: boolean) {
      const ns = literal ? literal_namespaces : id_namespaces;
      assert(!ns[name]);
      ns[name] = { global };
    }
    function handle_import_declaration(decl: TS.ImportDeclaration) {
      const specifier = decl.moduleSpecifier;
      assert(specifier.kind === TS.SyntaxKind.StringLiteral);
      const module_name = (specifier as TS.StringLiteral).text;
      function handle_clause_name(name: string) {
        throw new Error(`import ${name} from ${module_name}`);
      }
      function handle_import_specifier(spec: TS.ImportSpecifier) {
        const name = spec.name.text;
        const exported_name = spec.propertyName?.text;
        assert(!spec.isTypeOnly, `unhandled type only import`);
        if (exported_name === undefined) {
          push_imported(name, name, module_name);
        } else {
          push_imported(name, exported_name, module_name);
        }
      }
      function handle_clause_bindings(bindings: TS.NamedImportBindings) {
        switch (bindings.kind) {
          case TS.SyntaxKind.NamedImports:
            return bindings.elements.forEach(handle_import_specifier);
          case TS.SyntaxKind.NamespaceImport:
            return push_namespace_imported(bindings.name.text, module_name);
          default:
            const invalid: never = bindings;
            throw invalid;
        }
      }
      const clause = decl.importClause;
      if (clause) {
        if (clause.name) {
          handle_clause_name(clause.name.text);
        }
        if (clause.namedBindings) {
          handle_clause_bindings(clause.namedBindings);
        }
      }
    }
    function handle_export_declaration(decl: TS.ExportDeclaration) {
      const module_name = decl.moduleSpecifier
        ? (decl.moduleSpecifier as TS.StringLiteral).text
        : undefined;
      assert(module_name === undefined || typeof module_name === "string");
      function handle_export_specifier(spec: TS.ExportSpecifier) {
        const name = spec.name.text;
        const specname = spec.propertyName?.text;
        const type_only = spec.isTypeOnly;
        push_exported(name, type_only, specname ?? name, module_name);
      }
      function handle_named_exports(named_exports: TS.NamedExports) {
        named_exports.elements.forEach(handle_export_specifier);
      }
      function handle_named_export_bindings(bindings: TS.NamedExportBindings) {
        switch (bindings.kind) {
          case TS.SyntaxKind.NamedExports:
            return handle_named_exports(bindings);
          default:
            throw new Error(
              `unhandled named export binding type '${TS.SyntaxKind[bindings.kind]}'`,
            );
        }
      }
      assert(!decl.isTypeOnly);
      const name = decl.name?.text;
      if (name) {
        throw new Error(`export name '${name}'`);
      }
      const clause = decl.exportClause;
      if (clause) {
        handle_named_export_bindings(clause);
      }
    }
    function handle_module_declaration(decl: TS.ModuleDeclaration) {
      const module_name = decl.name.text;
      const kind = decl.name.kind;
      const literal_table: { [k in typeof kind]: boolean } = {
        [TS.SyntaxKind.Identifier]: false,
        [TS.SyntaxKind.StringLiteral]: true,
      };
      const literal = literal_table[kind];
      assert(literal !== undefined);
      if (!literal && module_name === "global") {
        const body = decl.body;
        assert(body !== undefined);
        switch (body.kind) {
          case TS.SyntaxKind.ModuleBlock:
            return body.statements.forEach(handle_main_definition(true));
          default:
            throw new Error(`unhandled module body '${TS.SyntaxKind[body.kind]}'`);
        }
      } else {
        push_namespace(module_name, literal);
      }
    }
    function handle_interface_declaration(decl: TS.InterfaceDeclaration) {
      const name = decl.name.text;
      const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
      const declared =
        decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
      assert(!declared);
      assert(!exported);
      push_type(name);
    }
    function handle_type_alias_declaration(decl: TS.TypeAliasDeclaration) {
      const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
      const declared =
        decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
      assert(!declared);
      assert(!exported);
      const name = decl.name.text;
      push_type(name);
    }
    function handle_function_declaration(decl: TS.FunctionDeclaration) {
      const name = decl.name?.text;
      const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
      assert(!exported);
      const declared =
        decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
      assert(name !== undefined);
      assert(declared);
      push_lexical(name);
    }
    function handle_variable_statement(decl: TS.VariableStatement) {
      const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
      assert(!exported);
      const declared =
        decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
      assert(declared);
      function handle_binding_name(binding: TS.BindingName) {
        switch (binding.kind) {
          case TS.SyntaxKind.Identifier:
            return push_lexical(binding.text);
          default:
            throw new Error(`unhandled binding type '${TS.SyntaxKind[binding.kind]}'`);
        }
      }
      function handle_decl(decl: TS.VariableDeclaration) {
        handle_binding_name(decl.name);
      }
      decl.declarationList.declarations.forEach(handle_decl);
    }
    function handle_statement(stmt: TS.Statement) {
      switch (stmt.kind) {
        case TS.SyntaxKind.ImportDeclaration:
          return handle_import_declaration(stmt as TS.ImportDeclaration);
        case TS.SyntaxKind.ExportDeclaration:
          return handle_export_declaration(stmt as TS.ExportDeclaration);
        case TS.SyntaxKind.ModuleDeclaration:
          return handle_module_declaration(stmt as TS.ModuleDeclaration);
        case TS.SyntaxKind.InterfaceDeclaration:
          return handle_interface_declaration(stmt as TS.InterfaceDeclaration);
        case TS.SyntaxKind.TypeAliasDeclaration:
          return handle_type_alias_declaration(stmt as TS.TypeAliasDeclaration);
        case TS.SyntaxKind.FunctionDeclaration:
          return handle_function_declaration(stmt as TS.FunctionDeclaration);
        case TS.SyntaxKind.VariableStatement:
          return handle_variable_statement(stmt as TS.VariableStatement);
        default:
          throw new Error(`unhandled statement in d.ts file '${TS.SyntaxKind[stmt.kind]}'`);
      }
    }
    return handle_statement;
  }
  statements.forEach(handle_main_definition(false));
  return {
    types,
    lexicals,
    imported,
    namespace_imported,
    exported,
    id_namespaces,
    literal_namespaces,
  };
}

export function parse_dts(code: string, my_path: string) {
  const options: TS.CreateSourceFileOptions = {
    languageVersion: TS.ScriptTarget.ESNext,
    jsDocParsingMode: TS.JSDocParsingMode.ParseNone,
  };
  const src = TS.createSourceFile(my_path, code, options);
  if (src.libReferenceDirectives.length !== 0) throw new Error("not handled");
  const data = parse_statements(src.statements);
  console.log(data);
}
