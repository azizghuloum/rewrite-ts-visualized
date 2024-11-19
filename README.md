# Term Rewrite System for TypeScript

# Progress

- [x] (Nov 16, 2024) lexical declarations (`let`, `const`) and lexical variables
- [x] (Nov 18, 2024) `splice(() => {body})`

# TODO

## types

- [ ] arrow functions `(args) => {body}` and `(args) => expr`
- [ ] type declarations `type T = ...` and typed lexical declarations `const x: T = ...`
- [ ] arrow function type parameters `<T>(args) => body`

## rewrite forms

- [ ] `rewrite_rules(x, [pattern, literals?, template]*, expr)` (aka. `let-syntax` with `syntax-rules`)

## separate compilations

- [ ] script serialization
- [ ] exports
- [ ] dependency tracking for module visits and invocations

## general improvements

- [ ] add source locations to ast/stx forms (most likely to tags).
- [ ] make a proper pretty printer
- [ ] unit testing

# Some references

- https://github.com/dsherret/ts-nameof/issues/121
