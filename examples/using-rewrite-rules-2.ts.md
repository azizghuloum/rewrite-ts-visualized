## `using-rewrite-rules-2.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [foo, foo(x), x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
```

### Output Program

```typescript
x_1 + x_1;
export const x_1 = 12;
```

