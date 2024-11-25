## `using-syntax-rules-3.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, foo(x), (foo) => x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
```

### Output Program

```typescript
(foo_8) => x_6 + x_6;
const x_6 = 12;
```

