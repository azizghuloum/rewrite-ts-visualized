import { LL } from "./llhelpers";

export type atom_tag =
  | "identifier"
  | "property_identifier"
  | "shorthand_property_identifier"
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
  shorthand_property_identifier: true,
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
  | "type_annotation"
  | "property_signature"
  | "literal_type"
  | "tuple_type"
  | "pair"
  | "object"
  | "array_pattern"
  | "object_pattern"
  | "slice"
  | "ERROR";

export const list_tags: { [k in list_tag]: list_tag } = {
  program: "program",
  lexical_declaration: "lexical_declaration",
  variable_declarator: "variable_declarator",
  export_statement: "export_statement",
  export_specifier: "export_specifier",
  export_clause: "export_clause",
  binary_expression: "binary_expression",
  unary_expression: "unary_expression",
  call_expression: "call_expression",
  arguments: "arguments",
  arrow_function: "arrow_function",
  formal_parameters: "formal_parameters",
  statement_block: "statement_block",
  empty_statement: "empty_statement",
  slice: "slice",
  array: "array",
  required_parameter: "required_parameter",
  member_expression: "member_expression",
  parenthesized_expression: "parenthesized_expression",
  ternary_expression: "ternary_expression",
  type_alias_declaration: "type_alias_declaration",
  type_parameters: "type_parameters",
  type_parameter: "type_parameter",
  type_arguments: "type_arguments",
  instantiation_expression: "instantiation_expression",
  type_query: "type_query",
  constraint: "constraint",
  import: "import",
  type_annotation: "type_annotation",
  property_signature: "property_signature",
  literal_type: "literal_type",
  tuple_type: "tuple_type",
  pair: "pair",
  object: "object",
  object_pattern: "object_pattern",
  array_pattern: "array_pattern",
  ERROR: "ERROR",
};

export type AST =
  | {
      type: "atom";
      wrap?: undefined;
      tag: atom_tag;
      content: string;
    }
  | {
      type: "list";
      wrap?: undefined;
      tag: list_tag;
      content: LL<AST>;
    };
