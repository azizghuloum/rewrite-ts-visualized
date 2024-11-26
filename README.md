# Term Rewrite System for TypeScript

# Goals

## Ability to define pattern matching

```typescript
type T = { type: "num"; num: number } | { type: "str"; str: string };

const x: T = { type: "num", num: 17 };

match(x, [
  [{ type: "num", num: n }, n + n],
  [{ type: "str", str: s }, s.length],
]);
```

# Progress

## basic expressions, statements, and declarations

- [x] (Nov 16, 2024) lexical declarations (`let`, `const`) and lexical variables
- [x] (Nov 21, 2024) arrow functions `(args) => {body}` and `(args) => expr`
- [ ] arrow functions initializer expressions, e.g., `(x = 12) => x`;
- [ ] function declarations
- [ ] return statement
- [ ] if statement
- [ ] while loop
- [ ] for loop
- [ ] object literals
- [ ] array literals
- [ ] class declarations

## types

- [ ] type declarations `type T = ...` and typed lexical declarations `const x: T = ...`
- [ ] arrow functions parameter types, e.g., `(x: T) => body`
- [ ] arrow functions type parameters, e.g., `<T>(x: X) => body`

## rewrite forms

- [x] (Nov 18, 2024) `splice(() => {body})`
- [ ] `rewrite_rules(x, [pattern, literals?, template]*, expr)` (aka. `let-syntax` with `syntax-rules`)

## separate compilations

- [ ] script serialization
- [ ] exports
- [ ] dependency tracking for module visits and invocations

## general improvements

- [x] (Nov 23, 2024) make a proper pretty printer (using prettier for now)
- [ ] add source locations to ast/stx forms (most likely to tags).

## code quality

- [x] (Nov 19, 2024) unit testing
- [ ] code coverage reports
- [ ] remove unused exports in code base

# Some references

- https://github.com/dsherret/ts-nameof/issues/121
