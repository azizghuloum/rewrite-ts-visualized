## `not-test-1.ts`

### status: `DONE`

### input

```typescript
using_syntax_rules(
  [not, not(x) ? a : b, x ? b : a],
  [not, not(x), !x],
  [not, not, (x) => not(x)],
).rewrite(not(not(not(1))) ? not : not(3))
```

### output

```typescript
1 ? !3 : (x_10) => !x_10;
```

