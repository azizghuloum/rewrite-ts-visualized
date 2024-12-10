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
export const x_3 = 1;
export const tmp_6 = x_3;
console.log(tmp_6);
export const tmp_8 = 17;
```

