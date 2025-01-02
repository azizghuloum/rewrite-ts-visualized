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
x$1 + ((foo$2, foo$3) => foo$3 + foo$2);
export const x$1 = 12;
```

