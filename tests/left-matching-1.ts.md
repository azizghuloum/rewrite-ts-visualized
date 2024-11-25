## `left-matching-1.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [foo, op(x,foo,y), op - x + y],
).rewrite(12(1,foo,3))
```

### output

```typescript
12 - 1 + 3;
```

