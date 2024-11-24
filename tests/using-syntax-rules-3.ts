using_syntax_rules(
  [foo, foo(x), (foo) => x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
