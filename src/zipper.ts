import * as Zipper from "zipper/src/tagged-constructive-zipper";
import { llmap } from "./llhelpers";
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
