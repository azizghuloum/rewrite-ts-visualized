using_syntax_rules(
  [capture,
   capture(expr, id, body), 
   using_syntax_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => capture(x, t, (x) => x + t))
