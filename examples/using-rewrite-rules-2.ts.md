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
x_7 + x_7;
export const x_7 = 12;
```

