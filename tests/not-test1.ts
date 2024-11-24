using_syntax_rules(
  [not, not(x) ? a : b, x ? b : a],
  [not, not(x), !x],
  [not, not, (x) => not(x)],
).rewrite(not(not(not(1))) ? not : not(3))
