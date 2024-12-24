import TS from "typescript";
import { assert } from "./assert";

function parse_statements(statements: TS.NodeArray<TS.Statement>) {
  const types: { [name: string]: { defined: boolean; exported: boolean } } = {};
  const lexicals: { [name: string]: { declared: boolean; exported: boolean } } = {};
  const imported: { [name: string]: { exported_name: string; exporting_module: string } } = {};
  const namespace_imported: { [name: string]: { exporting_module: string } } = {};
  const exported: { [name: string]: { local_name: string; module_name: string | undefined } } = {};
  function push_lexical(name: string, props: { declared: boolean; exported: boolean }) {
    assert(!lexicals[name]);
    lexicals[name] = props;
  }
  function push_type(name: string, props: { defined: boolean; exported: boolean }) {
    assert(!types[name]);
    types[name] = props;
  }
  function push_imported(name: string, exported_name: string, exporting_module: string) {
    assert(!imported[name]);
    imported[name] = { exported_name, exporting_module };
  }
  function push_namespace_imported(name: string, exporting_module: string) {
    assert(!namespace_imported[name]);
    namespace_imported[name] = { exporting_module };
  }
  function push_exported(local_name: string, name: string, module_name: string | undefined) {
    assert(!exported[name], `duplicate export ${local_name} as ${name}`);
    exported[name] = { local_name, module_name };
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
      if (specname) {
        push_exported(specname, name, module_name);
      } else {
        push_exported(name, name, module_name);
      }
    }
    function handle_named_exports(named_exports: TS.NamedExports) {
      named_exports.elements.forEach(handle_export_specifier);
    }
    function handle_named_export_bindings(bindings: TS.NamedExportBindings) {
      switch (bindings.kind) {
        case TS.SyntaxKind.NamedExports:
          return handle_named_exports(bindings);
        default:
          throw new Error(`unhandled named export binding type '${TS.SyntaxKind[bindings.kind]}'`);
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
    throw new Error(`module declaration '${module_name}'`);
  }
  function handle_interface_declaration(decl: TS.InterfaceDeclaration) {
    const name = decl.name.text;
    const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
    const declared = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
    assert(!declared);
    push_type(name, { defined: true, exported });
  }
  function handle_type_alias_declaration(decl: TS.TypeAliasDeclaration) {
    const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
    const declared = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
    assert(!declared);
    const name = decl.name.text;
    push_type(name, { defined: true, exported });
  }
  function handle_function_declaration(decl: TS.FunctionDeclaration) {
    const name = decl.name?.text;
    const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
    const declared = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
    assert(name !== undefined);
    assert(declared);
    push_lexical(name, { declared, exported });
  }
  function handle_variable_statement(decl: TS.VariableStatement) {
    const exported = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.ExportKeyword) ?? false;
    const declared = decl.modifiers?.some((x) => x.kind === TS.SyntaxKind.DeclareKeyword) ?? false;
    assert(declared);
    function handle_binding_name(binding: TS.BindingName) {
      switch (binding.kind) {
        case TS.SyntaxKind.Identifier:
          return push_lexical(binding.text, { declared, exported });
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
  statements.forEach(handle_statement);
  return { types, lexicals, imported, namespace_imported, exported };
}

export function parse_dts(code: string, my_path: string) {
  const options: TS.CreateSourceFileOptions = {
    languageVersion: TS.ScriptTarget.ESNext,
    jsDocParsingMode: TS.JSDocParsingMode.ParseNone,
  };
  const src = TS.createSourceFile(my_path, code, options);
  if (src.libReferenceDirectives.length !== 0) throw new Error("not handled");
  const data = parse_statements(src.statements);
}
