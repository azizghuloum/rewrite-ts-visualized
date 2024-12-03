## `curry-2.ts`

### Status: `DONE`

### Input Program

```typescript
define_rewrite_rules(
  [c, c(() => {body}),   (() => {body})()],
  [c, c(() => expr),     expr],
  [c, c((a, rest) => e), (a) => c((rest) => e)],
  [c, c((a) => e),       (a) => e],
);

const curried =
  c((a, b, c, d) => a + b + c + d);
```

### Output Program

```typescript
const curried_3 = (a_6) => (b_10) => (c_14) => (d_18) => a_6 + b_10 + c_14 + d_18;
```

