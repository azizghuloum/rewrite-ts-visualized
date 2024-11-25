## `arrow-function-2.ts`

### status: `SyntaxError`

```
x is already defined in normal_env```


### input

```typescript
const foo = (x) => {
  // should give a syntax error
  const x = 13;
};
```

### output

```typescript
const /*>>>*/ x /*<<<*/ = 13;
```

