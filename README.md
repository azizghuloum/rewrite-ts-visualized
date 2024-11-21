# Term Rewrite System for TypeScript

# Progress

- [x] (Nov 16, 2024) lexical declarations (`let`, `const`) and lexical variables
- [x] (Nov 18, 2024) `splice(() => {body})`
- [x] (Nov 19, 2024) unit testing
- [x] (Nov 21, 2024) arrow functions `(args) => {body}` and `(args) => expr`

# TODO

## arrow functions

- [ ] initializer expressions, e.g., `(x = 12) => x`;

## types

- [ ] type declarations `type T = ...` and typed lexical declarations `const x: T = ...`
- [ ] arrow functions parameter types, e.g., `(x: T) => body`
- [ ] arrow functions type parameters, e.g., `<T>(x: X) => body`

## rewrite forms

- [ ] `rewrite_rules(x, [pattern, literals?, template]*, expr)` (aka. `let-syntax` with `syntax-rules`)

## separate compilations

- [ ] script serialization
- [ ] exports
- [ ] dependency tracking for module visits and invocations

## general improvements

- [ ] add source locations to ast/stx forms (most likely to tags).
- [ ] make a proper pretty printer

# Some references

- https://github.com/dsherret/ts-nameof/issues/121
