using_rewrite_rules(
  [deftype, deftype(x as y), splice(() => {
    type x = y;
  })]
).rewrite(deftype(a as string));

type b = a;
