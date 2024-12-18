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
export const f_1 = (x_4) => x_4;
export const g_2 = (x_5) => f_1(x_5);
export const h_3 = (x_6) => x_6((x_7) => f_1(x_7));
```

