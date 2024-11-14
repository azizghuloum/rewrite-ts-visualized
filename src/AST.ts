import { LL } from "./llhelpers";

export type AST =
  | {
      type: "atom";
      wrap?: undefined;
      tag: string;
      content: string;
    }
  | {
      type: "list";
      wrap?: undefined;
      tag: string;
      content: LL<AST>;
    };
