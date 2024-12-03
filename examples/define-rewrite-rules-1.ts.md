## `define-rewrite-rules-1.ts`

### Status: `DONE`

### Input Program

```typescript
define_rewrite_rules(
  [foo, foo(x), x + x],
);

foo(12);

```

### Output Program

```typescript
12 + 12;
```

