import React from "react";
import { describe, expect, test, vi } from "vitest";
import { unwrapComponent } from "../components/chart/highchartsReact";

/*
 * Regression 2026-09-30: under Vite 8 (Rolldown) `import HighchartsReact from
 * "highcharts-react-official"` returned the CommonJS module object instead of the
 * component, so every chart threw "Element type is invalid ... got: object". The
 * global test setup MOCKS this package, which is why unit tests and the build
 * both passed; these tests cover the unwrapping and the real, unmocked package.
 */
const isComponentType = (c: any) => typeof c === "function" || (c && typeof c === "object" && "$$typeof" in c);

describe("unwrapComponent", () => {
  const Component = React.forwardRef<HTMLDivElement, {}>(() => null);

  test.each([
    ["the component itself", Component],
    ["module.exports = { default: Component }", { __esModule: true, default: Component }],
    ["module.exports = { HighchartsReact: Component } (named only)", { HighchartsReact: Component }],
    ["a namespace whose default is the CJS module object", { default: { __esModule: true, default: Component } }],
  ])("returns the component for %s", (_name, shape) => {
    expect(unwrapComponent(shape)).toBe(Component);
  });

  test("a plain function component is left alone", () => {
    const Fn = () => null;
    expect(unwrapComponent(Fn)).toBe(Fn);
  });
});

describe("the real (unmocked) highcharts-react-official package", () => {
  test("unwraps to a renderable component type, whatever the interop", async () => {
    const real: any = await vi.importActual("highcharts-react-official");
    const component = unwrapComponent(real);
    expect(isComponentType(component)).toBe(true);
    // The exact failure was React rejecting an element whose type is an object without $$typeof.
    expect(() => React.createElement(component as any, { highcharts: {}, options: {} })).not.toThrow();
    // ...and importing the package's default the way the app used to is NOT guaranteed to work:
    // document that the wrapper, not the raw default, is the safe entry point.
    expect(isComponentType(unwrapComponent(real.default ?? real))).toBe(true);
  });
});
