using_rewrite_rules(
  [foo, foo(x), x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
