## `macro-generating-macro-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [capture,
   capture(expr, id, body), 
   using_rewrite_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => capture(x, t, (x) => x + t))
```

### Output Program

```typescript
(x_4) => (x_8) => x_8 + x_4;
```

