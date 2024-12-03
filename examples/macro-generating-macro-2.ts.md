## `macro-generating-macro-2.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [capture,
   capture(expr, id, body), 
   using_syntax_rules([id, id, expr]).rewrite(body)],
).rewrite((x) => {
  const using_syntax_rules = 10;
  // capture introduces a using_syntax_rules form but that is
  // referentially transparent .. i.e., it doesn't care about
  // what's defined in its use site.  Capture always works, no
  // matter where you put it.
  capture(x, t, (x) => x + t);
})
```

### Output Program

```typescript
(x_4) => {
  const using_syntax_rules_7 = 10;
  (x_12) => x_12 + x_4;
};
```

