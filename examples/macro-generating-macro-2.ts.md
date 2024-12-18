## `macro-generating-macro-2.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [capture,
   capture(expr, id, body), 
   using_rewrite_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => {
  const using_rewrite_rules = 10;
  // capture introduces a using_rewrite_rules form but that is
  // referentially transparent .. i.e., it doesn't care about
  // what's defined in its use site.  Capture always works, no
  // matter where you put it.
  capture(x, t, (x) => x + t);
})
```

### Output Program

```typescript
(x_5) => {
  const using_rewrite_rules_7 = 10;
  (x_13) => x_13 + x_5;
};
```

