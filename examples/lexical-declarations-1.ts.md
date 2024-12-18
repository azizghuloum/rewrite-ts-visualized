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
export type t_1 = 12;
export const y_2 = 13,
  z_3: t_1 = y_2,
  q_4: t_1,
  r_5;
export const x_6 = (z_7) => {
  const t_8 = z_7;
};
```

