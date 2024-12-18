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
export const curried_1 = (a_2) => (b_3) => (c_4) => (d_5) => a_2 + b_3 + c_4 + d_5;
```

