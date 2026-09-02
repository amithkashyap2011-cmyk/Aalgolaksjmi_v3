/* Vitest + Testing Library setup */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/* ── Mock socket.io-client to prevent WebSocket connection errors ── */
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    id: "mock-socket-id",
    connected: false,
  })),
}));

/* ── Mock socket module to prevent verbose terminal subscription logs ── */
vi.mock("../lib/socket", () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    id: "mock-socket-id",
    connected: false,
  },
  subscribeTicker: vi.fn(),
  unsubscribeTicker: vi.fn(),
}));

/* ── Mock Highcharts React in JSDOM to prevent expensive SVG reflows ── */
vi.mock("highcharts-react-official", () => {
  const React = require("react");
  return {
    default: React.forwardRef((props: any, ref: any) =>
      React.createElement("div", {
        ref,
        "data-testid": "highcharts-mock",
        className: "highcharts-container",
      })
    ),
  };
});

/* ── Mock fetch — simulate server unreachable so store stays in mock-fallback mode ── */
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 503,
  json: () => Promise.resolve({ error: "Service unavailable" }),
  text: () => Promise.resolve("Service unavailable"),
} as any);

/* ── Mock localStorage for JSDom ────────────────────── */
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

/* ── Mock matchMedia for JSDom ──────────────────────── */
Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
