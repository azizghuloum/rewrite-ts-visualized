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
const f_3 = (x_9) => x_9;
const g_5 = (x_9) => f_3(x_9);
const h_7 = (x_9) => x_9((x_12) => f_3(x_12));
```

