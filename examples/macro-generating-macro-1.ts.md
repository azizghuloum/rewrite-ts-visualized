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
(x$1) => (x$2) => x$2 + x$1;
```

