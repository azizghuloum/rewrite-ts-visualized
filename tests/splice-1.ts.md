## `splice-1.ts`

### status: `DONE`

### input

```typescript
const t = 13;
splice(() => {
  const x = 17;
  const y = x + t;
});
const q = t + x;
```

### output

```typescript
const t_3 = 13;
const x_5 = 17;
const y_7 = x_5 + t_3;
const q_9 = t_3 + x_5;
```

