import { preexpand_helpers } from "./preexpand-helpers";
import { import_req, lexical_extension, modular_extension } from "./stx";
import { CompilationUnit, Context, Loc } from "./syntax-structures";

export type goodies = {
  loc: Loc;
  lexical: lexical_extension;
  context: Context;
  counter: number;
  unit: CompilationUnit;
  helpers: preexpand_helpers;
  imp: import_req;
};

export type data = goodies;

//export type data = {
//  modular: modular_extension;
//};

export type walker = (data: goodies) => Promise<goodies>;

export type walkerplus<T> = (data: goodies & T) => Promise<goodies>;

export type swalker = (data: goodies) => goodies;
