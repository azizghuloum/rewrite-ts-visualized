## `using-rewrite-rules-3.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [foo, foo(x), (foo) => x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
```

### Output Program

```typescript
(foo$2) => x$1 + x$1;
export const x$1 = 12;
```

