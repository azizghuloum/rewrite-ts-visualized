namespace AST {
  export let foo = 17;
  export namespace B {
    export type baz = string;
  }
}

namespace AST {
  const foo = 100;
  export const bar = 18;
  export namespace B {
    export type bar = typeof AST.bar;
    export let bar = 18;
  }
}

module BAZ {
  export const x = 19;
}

import foo = AST;

AST.foo = 19;
AST.B = { bar: 21 };

console.log(BAZ);
