## `object-pattern-3.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, {_: t1, foo, _: t2}, t1 + t2]
).rewrite({x: 1, foo, y: 2})
```

### Output Program

```typescript
1 + 2;
```

