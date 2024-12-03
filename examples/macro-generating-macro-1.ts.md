## `macro-generating-macro-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [capture,
   capture(expr, id, body), 
   using_syntax_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => capture(x, t, (x) => x + t))
```

### Output Program

```typescript
(x_4) => (x_10) => x_10 + x_4;
```

