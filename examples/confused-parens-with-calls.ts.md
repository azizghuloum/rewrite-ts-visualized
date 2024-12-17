## `confused-parens-with-calls.ts`

### Status: `DONE`

### Input Program

```typescript
const foo = (x) => {
  using_rewrite_rules([t, t, (x)]).rewrite(
    splice(() => {
      t;
      t;
    })
  );
};
```

### Output Program

```typescript
export const foo_2 = (x_5) => {
  x_5;
  x_5;
};
```

