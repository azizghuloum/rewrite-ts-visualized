using_syntax_rules(
  [foo, {_, foo, _}, "matched"]
).rewrite({x: 1, foo, y: 2, z: 3})
