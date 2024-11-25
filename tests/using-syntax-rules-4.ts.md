## `using-syntax-rules-4.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [foo, foo(x), foo + ((x, foo) => foo + x)],
  [foo, foo, x]
).rewrite(foo(foo))

const x = 12;
```

### output

```typescript
x_7 + ((foo_9, foo_11) => foo_11 + foo_9);
const x_7 = 12;
```

