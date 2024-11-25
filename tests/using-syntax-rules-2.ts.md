## `using-syntax-rules-2.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [foo, foo(x), x + x],
  [foo, foo, x]
).rewrite(foo(foo));
const x = 12;
```

### output

```typescript
x_8 + x_8;
const x_8 = 12;
```

