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
export type t$1 = 12;
export const y$2 = 13,
  z$3: t$1 = y$2,
  q$4: t$1,
  r$5;
export const x$6 = (z$7) => {
  const t$8 = z$7;
};
```

