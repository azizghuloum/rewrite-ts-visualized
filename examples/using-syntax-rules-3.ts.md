## `using-syntax-rules-3.ts`

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
(foo_7) => x_5 + x_5;
const x_5 = 12;
```

