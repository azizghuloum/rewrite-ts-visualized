## `expr-dot-where.ts`

### Status: `DONE`

### Input Program

```typescript
// from https://www.reddit.com/r/ProgrammingLanguages/comments/1gyo9hm/dear_language_designers_please_copy_where_from/
// from https://kiru.io/blog/posts/2024/dear-language-designers-please-copy-where-from-haskell/

define_rewrite_rules(
  [where, expr.where(a = b, rest), ((a) => expr.where(rest))(b)],
  [where, expr.where(a = b),       ((a) => expr)(b)],
  [where, expr.where(),            expr],
);
  
console.log(x + y).where(x = 1, y = x + 2);
```

### Output Program

```typescript
((x$1) => ((y$2) => console.log(x$1 + y$2))(x$1 + 2))(1);
```

