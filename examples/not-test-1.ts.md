## `not-test-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [not, not(x) ? a : b, x ? b : a],
  [not, not(x), !x],
  [not, not, (x) => not(x)],
).rewrite(not(not(not(1))) ? not : not(3))
```

### Output Program

```typescript
1 ? !3 : (x_10) => !x_10;
```

