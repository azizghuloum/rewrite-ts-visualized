## `macro-generating-tmp-binding-1.ts`

### Status: `DONE`

### Input Program

```typescript
define_rewrite_rules(
  [define_and_print, define_and_print(v), splice(() => {
    const tmp = v;    // this is hygienically inserted
    console.log(tmp); // and referenced
   })],
);
const x = 1;
define_and_print(x); // this will define a tmp
const tmp = 17; // which has nothing to do with this tmp
```

### Output Program

```typescript
export const x$1 = 1;
export const tmp$2 = x$1;
console.log(tmp$2);
export const tmp$3 = 17;
```

