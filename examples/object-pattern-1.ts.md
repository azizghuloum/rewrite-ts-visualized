## `object-pattern-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, {foo: x}, x + 2]
).rewrite({foo: 1})
```

### Output Program

```typescript
1 + 2;
```

