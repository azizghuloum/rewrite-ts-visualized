export function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(`condition failed` + (msg ? `: ${msg}` : ""));
  }
}
