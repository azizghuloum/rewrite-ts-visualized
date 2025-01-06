## `arrow-function-2.ts`

### Status: `SyntaxError`

```
x is already defined in normal_env
```

### Input Program

```typescript
const foo = (x) => {
  // should give a syntax error
  const x = 13;
};
```

### Output Program

```typescript
const foo$1 = (x$2) => {
  const /*>>>*/ x /*<<<*/ = 13;
};
```

