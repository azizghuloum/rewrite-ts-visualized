## `splice-1.ts`

### Status: `DONE`

### Input Program

```typescript
const t = 13;
splice(() => {
  const x = 17;
  const y = x + t;
});
const q = t + x;
```

### Output Program

```typescript
export const t_1 = 13;
export const x_2 = 17;
export const y_3 = x_2 + t_1;
export const q_4 = t_1 + x_2;
```

