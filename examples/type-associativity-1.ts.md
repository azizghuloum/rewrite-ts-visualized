## `type-associativity-1.ts`

### Status: `DONE`

### Input Program

```typescript
type q = number | string & 17 | 13;
const q = 12 | 13 & 14 | 15
```

### Output Program

```typescript
type q_3 = (number | (string & 17)) | 13;
const q_5 = 12 | (13 & 14) | 15;
```

