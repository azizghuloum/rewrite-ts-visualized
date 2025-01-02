## `macro-generating-type-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_rewrite_rules(
  [deftype, deftype(x as y), splice(() => {
    type x = y;
  })]
).rewrite(deftype(a as string));

type b = a;
```

### Output Program

```typescript
export type a$1 = string;
export type b$2 = a$1;
```

