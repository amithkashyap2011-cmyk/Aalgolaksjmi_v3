import * as HighchartsReactModule from "highcharts-react-official";

/**
 * `highcharts-react-official` is a CommonJS/UMD package with no ESM entry that
 * exports `{ __esModule: true, default: Component, HighchartsReact: Component }`.
 * Depending on the bundler's default-import interop, `import X from "..."`
 * yields either the component or that whole module object — Vite 8 (Rolldown)
 * follows Node semantics and returns the object, which crashed every chart with
 * "Element type is invalid: expected a string ... but got: object" (missed by the
 * unit tests, which mock this package). Unwrap it here, once, so it works under
 * either interop.
 */
// Reading a missing export can throw (ES module namespaces under strict test
// mocks), so every probe goes through a guarded getter.
const get = (o: any, key: string): any => {
  try { return o?.[key]; } catch { return undefined; }
};
// A React component is a function, or an object carrying $$typeof
// (forwardRef / memo). Anything else with a `default` is a module namespace.
const isComponent = (c: any): boolean =>
  typeof c === "function" || (c !== null && typeof c === "object" && get(c, "$$typeof") !== undefined);

export function unwrapComponent<T = any>(mod: any): T {
  let c = mod;
  for (let i = 0; i < 3 && c && !isComponent(c); i++) {
    c = get(c, "default") ?? get(c, "HighchartsReact");
  }
  return c as T;
}

const HighchartsReact = unwrapComponent<typeof HighchartsReactModule.default>(HighchartsReactModule);

export type { HighchartsReactRefObject, HighchartsReactProps } from "highcharts-react-official";

export default HighchartsReact;
