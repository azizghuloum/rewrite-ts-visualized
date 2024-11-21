export type LL<X> = null | [X, LL<X>];

export function llappend<X>(a1: LL<X>, a2: LL<X>): LL<X> {
  return a1 === null ? a2 : [a1[0], llappend(a1[1], a2)];
}

export function llmap<X, Y>(ls: LL<X>, f: (x: X) => Y): LL<Y> {
  return ls === null ? null : [f(ls[0]), llmap(ls[1], f)];
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
