## `left-matching-2.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [foo, [pre](xs,foo,ys)(args), [[pre],[xs],[ys],[args]]],
).rewrite([7,8,9](1,2,3,foo,4,5,6)(10,11,12))
```

### output

```typescript
[
  [7, 8, 9],
  [1, 2, 3],
  [4, 5, 6],
  [10, 11, 12],
];
```

