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
export const foo$1 = (x$2) => {
  x$2;
};
```

