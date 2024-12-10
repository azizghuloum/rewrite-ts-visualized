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
export const t_2 = 13;
export const x_4 = 17;
export const y_6 = x_4 + t_2;
export const q_8 = t_2 + x_4;
```

