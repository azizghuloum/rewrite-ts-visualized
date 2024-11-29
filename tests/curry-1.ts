using_syntax_rules(
  [c, c(() => {body}), (() => {body})()],
  [c, c(() => expr),   expr],
  [c, c((a, as) => e), (a) => c((as) => e)],
  [c, c((a) => e),     (a) => e],
).rewrite(c((a, b, c, d) => a + b + c + d));
