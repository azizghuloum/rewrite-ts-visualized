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
(a_5) => (b_9) => (c_13) => (d_17) => a_5 + b_9 + c_13 + d_17;
```

