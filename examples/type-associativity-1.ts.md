## `type-associativity-1.ts`

### Status: `DONE`

### Input Program

```typescript
type q = number | string & 17 | 13;
const q = 12 | 13 & 14 | 15
```

### Output Program

```typescript
export type q$1 = (number | (string & 17)) | 13;
export const q$2 = 12 | (13 & 14) | 15;
```

