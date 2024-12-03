## `confused-parens-with-calls.ts`

### Status: `DONE`

### Input Program

```typescript
const foo = (x) => {
  using_syntax_rules([t, t, (x)]).rewrite(
    splice(() => {
      t;
      t;
    })
  );
};
```

### Output Program

```typescript
const foo_2 = (x_4) => {
  x_4;
  x_4;
};
```

