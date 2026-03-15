/*
 * ─── SettingsPage ──────────────────────────────────────
 *
 * Phase 2: 4-tab interface (mock data only):
 *   1. API Keys (Binance) – input fields
 *   2. Symbols – add/remove allowed Binance symbols
 *   3. Risk & Behaviour – risk sliders + detailed animal weights
 *   4. UI & Chart – theme, Fibonacci zones, default timeframe
 */
import { useState } from "react";
import clsx from "clsx";
import { useAppStore } from "../store/useAppStore";
import Card from "../ui/Card";
import PageShell from "../components/layout/PageShell";
import { ANIMAL_MODIFIERS, SYMBOLS, TIMEFRAMES } from "../mock/data";

const TABS = ["API Keys", "Symbols", "Risk & Behaviour", "UI & Chart"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<string>(TABS[0]);
  const { allowedSymbols, behaviorWeights, setBehaviorWeight } = useAppStore();

  /* local state for forms */
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newSym, setNewSym] = useState("");
  const [symbols, setSymbols] = useState<string[]>([...allowedSymbols]);
  const [riskLevel, setRiskLevel] = useState(50);
  const [maxDrawdown, setMaxDrawdown] = useState(15);
  const [darkMode, setDarkMode] = useState(false);
  const [showFib, setShowFib] = useState(true);
  const [defaultTf, setDefaultTf] = useState("5m");

  return (
    <PageShell title="Settings">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-phi-2" data-testid="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-phi-4 py-1.5 rounded-phi text-phi-xs font-medium transition-all duration-200",
              tab === t
                ? "bg-aalgreen text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="p-phi-5">
        {/* ── Tab: API Keys ── */}
        {tab === "API Keys" && (
          <div className="space-y-phi-4 max-w-lg" data-testid="tab-apikeys">
            <div>
              <h3 className="text-phi-sm font-semibold mb-phi-3">Binance API Keys</h3>
              <p className="text-phi-xs text-slate-400 mb-phi-3">
                Keys are encrypted with AES-256-GCM on the server. Required for LIVE trading.
              </p>
            </div>
            <div>
              <label className="block text-phi-xs font-medium text-slate-500 mb-1">API Key</label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm font-mono"
                placeholder="Enter your Binance API Key"
              />
            </div>
            <div>
              <label className="block text-phi-xs font-medium text-slate-500 mb-1">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm font-mono"
                placeholder="Enter your Binance API Secret"
              />
            </div>
            <div className="flex gap-phi-2">
              <button
                disabled={!apiKey || !apiSecret}
                onClick={() => setKeyMsg({ ok: true, text: "Keys saved & encrypted ✓ (mock)" })}
                className="px-phi-4 py-2.5 bg-aalgreen text-white rounded-phi text-phi-xs font-semibold disabled:opacity-50 hover:bg-aalgreen-dark transition-colors"
              >
                Save Keys
              </button>
              <button
                onClick={() => setKeyMsg({ ok: true, text: "Connection test passed ✓ (mock)" })}
                className="px-phi-4 py-2.5 bg-slate-800 text-white rounded-phi text-phi-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                Test Connection
              </button>
            </div>
            {keyMsg && (
              <p className={clsx("text-phi-xs font-medium", keyMsg.ok ? "text-aalgreen" : "text-aalred")}>
                {keyMsg.text}
              </p>
            )}
          </div>
        )}

        {/* ── Tab: Symbols ── */}
        {tab === "Symbols" && (
          <div className="space-y-phi-4" data-testid="tab-symbols">
            <h3 className="text-phi-sm font-semibold">Allowed Binance Symbols</h3>
            <div className="flex flex-wrap gap-phi-2">
              {symbols.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-phi-3 py-1 bg-slate-50 border border-slate-200 rounded-phi text-phi-xs font-medium"
                >
                  {s}
                  <button
                    onClick={() => setSymbols((prev) => prev.filter((x) => x !== s))}
                    className="text-slate-400 hover:text-aalred ml-1 text-sm leading-none"
                    aria-label={`Remove ${s}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-phi-2 max-w-sm">
              <input
                value={newSym}
                onChange={(e) => setNewSym(e.target.value.toUpperCase())}
                className="flex-1 p-2.5 border border-slate-200 rounded-phi text-phi-sm"
                placeholder="e.g. BTCUSDT"
              />
              <button
                onClick={() => {
                  if (newSym && !symbols.includes(newSym)) {
                    setSymbols((prev) => [...prev, newSym]);
                    setNewSym("");
                  }
                }}
                className="px-phi-4 py-2.5 bg-aalgreen text-white rounded-phi text-phi-xs font-semibold hover:bg-aalgreen-dark transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Risk & Behaviour ── */}
        {tab === "Risk & Behaviour" && (
          <div className="space-y-phi-5" data-testid="tab-risk">
            {/* Risk sliders */}
            <div>
              <h3 className="text-phi-sm font-semibold mb-phi-3">Risk Management</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-phi-4 max-w-2xl">
                <div>
                  <div className="flex justify-between text-phi-xs mb-1">
                    <span className="font-medium">Risk Level</span>
                    <span className="font-bold tabular-nums">{riskLevel}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={riskLevel}
                    onChange={(e) => setRiskLevel(Number(e.target.value))}
                    className="w-full accent-aalgold"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Conservative</span><span>Aggressive</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-phi-xs mb-1">
                    <span className="font-medium">Max Drawdown</span>
                    <span className="font-bold tabular-nums">{maxDrawdown}%</span>
                  </div>
                  <input
                    type="range" min={1} max={50} value={maxDrawdown}
                    onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                    className="w-full accent-aalred"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Tight (1%)</span><span>Loose (50%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed animal weights */}
            <div>
              <h3 className="text-phi-sm font-semibold mb-phi-3">Animal Behavior Weights</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-phi-3">
                {ANIMAL_MODIFIERS.map((a) => {
                  const val = behaviorWeights[a.key] ?? 50;
                  return (
                    <div key={a.key} className="p-phi-3 rounded-phi-lg border border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{a.emoji}</span>
                        <div>
                          <span className="text-phi-xs font-semibold">{a.name}</span>
                          <span className="text-[9px] text-slate-400 ml-2">{a.desc}</span>
                        </div>
                        <span className="ml-auto text-phi-xs font-bold text-aalgold tabular-nums">{val}</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={val}
                        onChange={(e) => setBehaviorWeight(a.key, Number(e.target.value))}
                        className="w-full h-1.5 accent-aalgold cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: UI & Chart ── */}
        {tab === "UI & Chart" && (
          <div className="space-y-phi-4 max-w-lg" data-testid="tab-ui">
            <h3 className="text-phi-sm font-semibold">Appearance & Chart Settings</h3>

            <label className="flex items-center gap-phi-3 cursor-pointer p-phi-3 rounded-phi border border-slate-100 hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
                className="accent-aalgreen rounded"
              />
              <div>
                <span className="text-phi-sm font-medium">Enable Dark Mode</span>
                <p className="text-[10px] text-slate-400">Switch to dark color scheme</p>
              </div>
            </label>

            <label className="flex items-center gap-phi-3 cursor-pointer p-phi-3 rounded-phi border border-slate-100 hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={showFib}
                onChange={(e) => setShowFib(e.target.checked)}
                className="accent-aalgreen rounded"
              />
              <div>
                <span className="text-phi-sm font-medium">Show Fibonacci Zones</span>
                <p className="text-[10px] text-slate-400">Color bands at 0.236, 0.382, 0.5, 0.618, 0.786</p>
              </div>
            </label>

            <div>
              <label className="block text-phi-xs font-medium text-slate-500 mb-1">Default Timeframe</label>
              <select
                value={defaultTf}
                onChange={(e) => setDefaultTf(e.target.value)}
                className="p-2.5 border border-slate-200 rounded-phi text-phi-sm"
              >
                {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
