## `lexical-declarations-1.ts`

### Status: `DONE`

### Input Program

```typescript
type t = 12;
const y = 13, z: t = y, q: t, r;

export const x = (z) => {
  const t = z;
};
```

### Output Program

```typescript
export type t_2 = 12;
export const y_4 = 13,
  z_6: t_2 = y_4,
  q_8: t_2,
  r_10;
export const x_12 = (z_14) => {
  const t_15 = z_14;
};
```

