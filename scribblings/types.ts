interface t {
  foo: { foo: string };
}
interface t {
  bar: number;
}
namespace t {
  export type bar = 12;
}

const x: t["foo"] = {
  foo: "hello",
};
