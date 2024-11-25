## `splice-2.ts`

### Status: `DONE`

### Input Program

```typescript
const foo = (x) => {
  using_syntax_rules([t,t,x]).rewrite(splice(() => {
    t;
    t;
  }));  
}
```

### Output Program

```typescript
const foo_3 = (x_5) => {
  x_5;
  x_5;
};
```

