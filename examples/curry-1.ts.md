## `curry-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [c, c(() => {body}), (() => {body})()],
  [c, c(() => expr),   expr],
  [c, c((a, as) => e), (a) => c((as) => e)],
  [c, c((a) => e),     (a) => e],
).rewrite(c((a, b, c, d) => a + b + c + d));
```

### Output Program

```typescript
(a_1) => (b_2) => (c_3) => (d_4) => a_1 + b_2 + c_3 + d_4;
```

