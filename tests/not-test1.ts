using_syntax_rules(
  [not, not(x) ? a : b, x ? b : a],
  [not, not(x), !x],
).rewrite(not(not(not(1))) ? 2 : not(3))
