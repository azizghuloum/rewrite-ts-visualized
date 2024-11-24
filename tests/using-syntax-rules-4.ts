using_syntax_rules(
  [foo, foo(x), foo + (x, foo) => foo + x],
  [foo, foo, x]
).rewrite(foo(foo))

const x = 12;
