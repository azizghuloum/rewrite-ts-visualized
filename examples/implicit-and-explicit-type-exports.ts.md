## `implicit-and-explicit-type-exports.ts`

### Status: `DONE`

### Input Program

```typescript
type not_explicitly_exported_type = string; // this should have an export added in the output
export type explicitly_exported_type = number; // this should stay exported in the output
```

### Output Program

```typescript
export type not_explicitly_exported_type_2 = string;
export type explicitly_exported_type_4 = number;
```

