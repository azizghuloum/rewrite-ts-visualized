## `using-syntax-rules-4.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, foo(x), foo + ((x, foo) => foo + x)],
  [foo, foo, x]
).rewrite(foo(foo))

const x = 12;
```

### Output Program

```typescript
x_7 + ((foo_9, foo_11) => foo_11 + foo_9);
const x_7 = 12;
```

