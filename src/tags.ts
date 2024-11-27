export type atom_tag =
  | "identifier"
  | "property_identifier"
  | "number"
  | "regex_pattern"
  | "type_identifier"
  | "jsx_text"
  | "string"
  | "ERROR"
  | "other";

export const id_tags: { [k in atom_tag]: boolean } = {
  identifier: true,
  type_identifier: true,
  property_identifier: true,
  jsx_text: false,
  number: false,
  string: false,
  other: false,
  regex_pattern: false,
  ERROR: false,
};

export type list_tag =
  | "program"
  | "lexical_declaration"
  | "variable_declarator"
  | "export_statement"
  | "export_specifier"
  | "export_clause"
  | "binary_expression"
  | "unary_expression"
  | "call_expression"
  | "arguments"
  | "arrow_function"
  | "formal_parameters"
  | "statement_block"
  | "empty_statement"
  | "array"
  | "required_parameter"
  | "member_expression"
  | "parenthesized_expression"
  | "ternary_expression"
  | "type_alias_declaration"
  | "type_parameters"
  | "type_parameter"
  | "constraint"
  | "type_arguments"
  | "instantiation_expression"
  | "type_query"
  | "import"
  | "import_specifier"
  | "named_imports"
  | "import_clause"
  | "import_statement"
  | "namespace_import"
  | "type_annotation"
  | "property_signature"
  | "literal_type"
  | "tuple_type"
  | "pair"
  | "object"
  | "array_pattern"
  | "object_pattern"
  | "slice"
  | "syntax_list"
  | "ERROR";
