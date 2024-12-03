using_rewrite_rules(
  [foo, {_: t1, foo, _: t2}, t1 + t2]
).rewrite({x: 1, foo, y: 2})
