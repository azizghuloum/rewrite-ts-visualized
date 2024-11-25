## `left-matching-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, op(x,foo,y), op - x + y],
).rewrite(12(1,foo,3))
```

### Output Program

```typescript
12 - 1 + 3;
```

