import { preexpand_helpers } from "./preexpand-helpers";
import { import_req, lexical_extension, modular_extension } from "./stx";
import { CompilationUnit, Context, Loc } from "./syntax-structures";

export type counters = { vars: number; internal: number };

export type data = {
  loc: Loc;
  lexical: lexical_extension;
  context: Context;
  counters: counters;
  unit: CompilationUnit;
  helpers: preexpand_helpers;
  imp: import_req;
  modular: modular_extension;
};

export type walker = (data: data) => Promise<data>;

export type walkerplus<T> = (data: data & T) => Promise<data>;

export type swalker = (data: data) => data;
