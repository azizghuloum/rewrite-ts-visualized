## `expr-dot-where.ts`

### Status: `DONE`

### Input Program

```typescript
// from https://www.reddit.com/r/ProgrammingLanguages/comments/1gyo9hm/dear_language_designers_please_copy_where_from/
// from https://kiru.io/blog/posts/2024/dear-language-designers-please-copy-where-from-haskell/

using_syntax_rules(
  [where, expr.where(a = b, rest), ((a) => expr.where(rest))(b)],
  [where, expr.where(a = b),       ((a) => expr)(b)],
  [where, expr.where(),            expr],
).rewrite(
  
  (x + y).where(x = 1, y = x + 2)

);
```

### Output Program

```typescript
((x_6) => ((y_10) => x_6 + y_10)(x_6 + 2))(1);
```

