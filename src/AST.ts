import { LL } from "./llhelpers";

export type atom_tag =
  | "identifier"
  | "property_identifier"
  | "shorthand_property_identifier"
  | "number"
  | "regex_pattern"
  | "type_identifier"
  | "jsx_text"
  | "string_fragment"
  | "ERROR"
  | "other";

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
      tag: string;
      content: LL<AST>;
    };
