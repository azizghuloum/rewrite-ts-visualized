using_rewrite_rules(
  [foo, foo(x), x],
  //[foo, { literals: [name], capturing: [d], nonrecursive: [bar] }, foo.name, "foo"],
  //[foo, foo.prop, "foo"],
  //[foo, foo, 17],
).rewrite(foo(12));
