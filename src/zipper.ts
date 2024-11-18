import * as Zipper from "zipper/src/tagged-constructive-zipper";
import { assert } from "./assert";
import { LL, llappend, llmap } from "./llhelpers";
import { STX, Loc, Wrap } from "./syntax-structures";
import { push_wrap } from "./STX";

export function wrap_loc(loc: Loc, wrap: Wrap): Loc {
  return Zipper.change(loc, push_wrap(wrap)(loc.t));
}

export function mkzipper(stx: STX): Loc {
  return Zipper.mkzipper(stx);
}

export function reconvert<Y>(
  zipper: Loc,
  mark: (y: Y) => Y,
  conv: (x: STX) => Y,
  wrap: (tag: string, children: Y[]) => Y
): Y {
  return Zipper.reconvert(zipper, mark, conv, wrap);
}

export function stx_list_content(t: STX): LL<STX> {
  assert(t.type === "list");
  if (t.wrap) {
    return llmap(t.content, push_wrap(t.wrap));
  } else {
    return t.content;
  }
}

export function go_down<S>(loc: Loc, f: (loc: Loc) => S): S {
  const x: Loc = Zipper.go_down(loc, (t, cb) => {
    switch (t.type) {
      case "list": {
        return cb(t.tag, stx_list_content(t));
      }
      default:
        throw new Error("HERE");
    }
  });
  return f(x);
}

export function isolate(loc: Loc): Loc {
  return { type: "loc", t: loc.t, p: { type: "top" } };
}

export function change(loc: Loc, new_loc: Loc): Loc {
  assert(new_loc.p.type === "top");
  return { type: "loc", t: new_loc.t, p: loc.p };
}

export function change_splicing(loc: Loc, list: [STX, LL<STX>]): Loc {
  const p = loc.p;
  assert(p.type === "node");
  return {
    type: "loc",
    t: list[0],
    p: { ...p, r: llappend(list[1], p.r) },
  };
}

function mkstx(tag: string, content: LL<STX>): STX {
  return { type: "list", tag, wrap: undefined, content };
}

export function go_next<S>(
  loc: Loc,
  sk: (loc: Loc) => S,
  fk: (loc: Loc) => S
): S {
  switch (loc.p.type) {
    case "node": {
      if (loc.p.r === null) {
        return go_next(Zipper.go_up(loc, mkstx), sk, fk);
      } else {
        return sk(Zipper.go_right(loc));
      }
    }
    case "top": {
      return fk(loc);
    }
  }
}

export function go_right<S>(
  loc: Loc,
  sk: (loc: Loc) => S,
  fk: (loc: Loc) => S
): S {
  if (loc.p.type === "node" && loc.p.r === null) {
    // no right of me
    return fk(loc);
  } else {
    return sk(Zipper.go_right(loc));
  }
}
