## `macro-generating-type-1.ts`

### Status: `DONE`

### Input Program

```typescript
using_syntax_rules(
  [deftype, deftype(x as y), splice(() => {
    type x = y;
  })]
).rewrite(deftype(a as string));

type b = a;
```

### Output Program

```typescript
type a_5 = string;
type b_7 = a_5;
```

