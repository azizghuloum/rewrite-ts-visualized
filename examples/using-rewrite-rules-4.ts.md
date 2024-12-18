## `using-rewrite-rules-4.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [foo, foo(x), foo + ((x, foo) => foo + x)],
  [foo, foo, x]
).rewrite(foo(foo))

const x = 12;
```

### Output Program

```typescript
x_1 + ((foo_2, foo_3) => foo_3 + foo_2);
export const x_1 = 12;
```

