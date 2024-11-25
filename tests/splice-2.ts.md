## `splice-2.ts`

### status: `DONE`

### input

```typescript
const foo = (x) => {
  using_syntax_rules([t,t,x]).rewrite(splice(() => {
    t;
    t;
  }));  
}
```

### output

```typescript
const foo_3 = (x_5) => {
  x_5;
  x_5;
};
```

