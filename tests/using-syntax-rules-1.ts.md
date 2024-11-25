## `using-syntax-rules-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [foo, foo(x), x],
  //[foo, { literals: [name], capturing: [d], nonrecursive: [bar] }, foo.name, "foo"],
  //[foo, foo.prop, "foo"],
  //[foo, foo, 17],
).rewrite(foo(12));
```

### Output Program

```typescript
12;
```

