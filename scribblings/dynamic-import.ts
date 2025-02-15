#!/usr/local/bin/deno --allow-all --unstable-sloppy-imports

// from https://docs.deno.com/deploy/api/dynamic-import/

// seems to work in deno and bun
const text1 = "data:text/typescript,/**/export const val: number = 42;";
const text2 = "data:text/typescript,/**/export const val: number = 43;";

const x = await import(Math.random() < 0.5 ? text1 : text2);
console.log(x.val); // -> 42 or 43

const j = import.meta.resolve("json-stable-stringify");
console.log({ j });

const d = import.meta.dirname;
console.log(d);
const text3 = `data:text/typescript,
import j from "${j}";
import {t} from 'file:${d}/export-3.ts';
export const foo = j(t);
`;
const result3 = await import(text3);
console.log({ text3, f: result3.foo });

export {};
