import * as Zipper from "zipper/src/tagged-constructive-zipper";
import { assert } from "./assert";
import { LL, llmap } from "./llhelpers";
import { push_wrap, STX, Wrap } from "./STX";

export type Loc = Zipper.Loc<string, STX>;

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

export function go_down<S>(loc: Loc, f: (loc: Loc) => S): S {
  const x: Loc = Zipper.go_down(loc, (t, cb) => {
    switch (t.type) {
      case "list": {
        if (t.wrap) {
          return cb(t.tag, llmap(t.content, push_wrap(t.wrap)));
        } else {
          return cb(t.tag, t.content);
        }
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
