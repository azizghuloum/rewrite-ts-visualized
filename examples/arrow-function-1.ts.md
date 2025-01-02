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
export const f$1 = (x$4) => x$4;
export const g$2 = (x$5) => f$1(x$5);
export const h$3 = (x$6) => x$6((x$7) => f$1(x$7));
```

