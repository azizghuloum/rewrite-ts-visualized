## `arrow-function-5.ts`

### Status: `DONE`

### Input Program

```typescript
const foo = (x) => {
  using_rewrite_rules([t,t,x]).rewrite(splice(() => {
    t
  }));  
}
```

### Output Program

```typescript
export const foo_1 = (x_2) => {
  x_2;
};
```

