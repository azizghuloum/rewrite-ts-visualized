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
export const f_2 = (x_9) => x_9;
export const g_4 = (x_12) => f_2(x_12);
export const h_6 = (x_15) => x_15((x_18) => f_2(x_18));
```

