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
export const curried$1 = (a$2) => (b$3) => (c$4) => (d$5) => a$2 + b$3 + c$4 + d$5;
```

