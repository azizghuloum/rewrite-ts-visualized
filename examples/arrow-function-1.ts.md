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
export const f_2 = (x_8) => x_8;
export const g_4 = (x_9) => f_2(x_9);
export const h_6 = (x_10) => x_10((x_11) => f_2(x_11));
```

