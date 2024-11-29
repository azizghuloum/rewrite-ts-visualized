## `curry-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [c, c(() => {body}), (() => {body})()],
  [c, c(() => expr),   expr],
  [c, c((a, as) => e), (a) => c((as) => e)],
  [c, c((a) => e),     (a) => e],
).rewrite(c((a, b, c, d) => a + b + c + d));
```

### Output Program

```typescript
(a_6) => (b_10) => (c_14) => (d_18) => a_6 + b_10 + c_14 + d_18;
```

