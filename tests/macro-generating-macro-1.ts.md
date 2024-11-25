## `macro-generating-macro-1.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [capture,
   capture(expr, id, body), 
   using_syntax_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => capture(x, t, (x) => x + t))
```

### output

```typescript
(x_5) => (x_11) => x_11 + x_5;
```

