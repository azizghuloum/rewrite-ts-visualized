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
x_6 + ((foo_8, foo_10) => foo_10 + foo_8);
export const x_6 = 12;
```

