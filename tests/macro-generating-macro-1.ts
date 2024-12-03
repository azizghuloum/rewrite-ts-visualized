using_rewrite_rules(
  [capture,
   capture(expr, id, body), 
   using_rewrite_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => capture(x, t, (x) => x + t))
