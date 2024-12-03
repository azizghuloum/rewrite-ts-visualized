## `left-matching-2.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [foo, [pre](xs,foo,ys)(args), [[pre],[xs],[ys],[args]]],
).rewrite([7,8,9](1,2,3,foo,4,5,6)(10,11,12))
```

### Output Program

```typescript
[
  [7, 8, 9],
  [1, 2, 3],
  [4, 5, 6],
  [10, 11, 12],
];
```

