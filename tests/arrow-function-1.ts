const f = (x) => x;
const g = (x) => f(x);
const h = (x) => x((x) => f(x));
