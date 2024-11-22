export function assert(condition: boolean, msg?: any): asserts condition {
  if (!condition) {
    throw new Error(`condition failed` + (msg ? `: ${JSON.stringify(msg)}` : ""));
  }
}
