## `arrow-function-1.ts`

### Status: `DONE`

### Input Program

```typescript
const f = (x) => x;
const g = (x) => f(x);
const h = (x) => x((x) => f(x));
```

### Output Program

```typescript
const f_2 = (x_8) => x_8;
const g_4 = (x_8) => f_2(x_8);
const h_6 = (x_8) => x_8((x_11) => f_2(x_11));
```

