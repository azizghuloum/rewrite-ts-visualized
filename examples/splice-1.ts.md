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
export const t$1 = 13;
export const x$2 = 17;
export const y$3 = x$2 + t$1;
export const q$4 = t$1 + x$2;
```

