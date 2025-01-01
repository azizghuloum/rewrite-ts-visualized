export type LL<X> = null | [X, LL<X>];

export function llappend<X>(a1: LL<X>, a2: LL<X>): LL<X> {
  return a1 === null ? a2 : [a1[0], llappend(a1[1], a2)];
}

export function llreduce<X, AC>(ls: LL<X>, f: (x: X, ac: AC) => AC, ac: AC): AC {
  if (ls === null) {
    return ac;
  } else {
    return f(ls[0], llreduce(ls[1], f, ac));
  }
}

export function llmap<X, Y>(ls: LL<X>, f: (x: X) => Y): LL<Y> {
  return ls === null ? null : [f(ls[0]), llmap(ls[1], f)];
}

export function llforeach<X, Y>(ls: LL<X>, f: (x: X) => Y): void {
  if (ls !== null) {
    f(ls[0]);
    llforeach(ls[1], f);
  }
}

export function array_to_ll<X>(a: X[]): LL<X> {
  let ll: LL<X> = null;
  for (let i = a.length - 1; i >= 0; i--) ll = [a[i], ll];
  return ll;
}

export function ll_to_array<X>(a: LL<X>): X[] {
  let ls: X[] = [];
  while (a !== null) {
    ls.push(a[0]);
    a = a[1];
  }
  return ls;
}

export function llreverse<X>(a: LL<X>): LL<X> {
  let ll: LL<X> = null;
  while (a !== null) {
    ll = [a[0], ll];
    a = a[1];
  }
  return ll;
}

export function join_separated<X>(a: LL<X>, sep: X): LL<X> {
  if (a === null) return a;
  if (a[1] === null) return a;
  return [a[0], [sep, join_separated(a[1], sep)]];
}
