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
export type a_1 = string;
export type b_2 = a_1;
```

