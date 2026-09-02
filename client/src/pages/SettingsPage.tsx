import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAppStore, THEMES } from "../store/useAppStore";
import { useDashboardStore } from "../store/useDashboardStore";
import PageShell from "../components/layout/PageShell";
import { SYMBOLS, TIMEFRAMES } from "../mock/data";
import * as api from "../lib/api";
import {
  Settings as SettingsIcon,
  Key,
  Coins,
  ShieldCheck,
  Layout,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  Cpu,
  Monitor,
  Cloud,
  Database,
  ArrowRight,
  Server,
  RefreshCw,
  Play,
  Square,
  Activity,
  AlertTriangle,
  Wallet,
  Power,
  PowerOff,
  Landmark
} from "lucide-react";

const TABS = ["API_KEYS", "WALLET", "THEME_ENGINE", "MANAGE_COINS", "RISK_CONTROL", "AI_MODELS", "SERVICES", "INTERFACE", "EXTERNAL_SYNC"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<string>(TABS[0]);
  const {
    allowedSymbols, connected, setAllowedSymbols,
    execMode, setExecMode,
    highPrecisionMode, noLossMode,
    setHighPrecisionMode, setNoLossMode,
    theme, setTheme,
    dynamicSLTP, defaultSL,
    setDynamicSLTP, setDefaultSL,
    aiConsensusGate, setAiConsensusGate,
    orderFlowVotingEnabled, setOrderFlowVotingEnabled,
    smartMoneyVotingEnabled, setSmartMoneyVotingEnabled,
    liveNewsSentimentEnabled, setLiveNewsSentimentEnabled,
    cnnVotingEnabled, setCnnVotingEnabled,
    lstmVotingEnabled, setLstmVotingEnabled,
    mambaVotingEnabled, setMambaVotingEnabled,
    lnnVotingEnabled, setLnnVotingEnabled,
    transformerVotingEnabled, setTransformerVotingEnabled,
    ppoVotingEnabled, setPpoVotingEnabled,
    gayatriVotingEnabled, setGayatriVotingEnabled,
    ohmkaraVotingEnabled, setOhmkaraVotingEnabled,
    lakshmiVotingEnabled, setLakshmiVotingEnabled,
    aiPredictorsEnabled, setAiPredictorsEnabled,
    transitionOverrideEnabled, setTransitionOverrideEnabled,
    behaviourModelEnabled, setBehaviourModelEnabled,
    taFallbackEnabled, setTaFallbackEnabled,
    taFallbackScope, setTaFallbackScope,
    riskLevel, setRiskLevel,
    maxDrawdown, setMaxDrawdown,
    autoTradeThreshold, setAutoTradeThreshold,
    shortScoreThreshold, setShortScoreThreshold,
    aiFlipExitMinProfitR, setAiFlipExitMinProfitR,
    driftHaltThreshold, setDriftHaltThreshold,
    driftReduceThreshold, setDriftReduceThreshold,
    saraswatiAlphaThreshold, setSaraswatiAlphaThreshold,
    density, setDensity,
    timeframe: defaultTf, setTimeframe: setDefaultTf,
  } = useAppStore();

  const { currencyMode, setCurrencyMode } = useDashboardStore();

  // ── AI Model Registry toggles ──
  const [aiModels, setAiModels] = useState<any[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  // ── Services Control ──
  const [services, setServices] = useState<any>(null);
  const [svcLoading, setSvcLoading] = useState(false);
  const [svcAction, setSvcAction] = useState<string | null>(null);
  // ── External Sync ──
  const [extStatus, setExtStatus] = useState<any>(null);
  const [extLoading, setExtLoading] = useState(false);
  const [extAction, setExtAction] = useState<string | null>(null);
  const [extAccount, setExtAccount] = useState<any>(null);
  const [extError, setExtError] = useState<string | null>(null);
  // ── Angel One SmartAPI State ──
  const [angelApiKey, setAngelApiKey] = useState("");
  const [angelClientCode, setAngelClientCode] = useState("");
  const [angelPin, setAngelPin] = useState("");
  const [angelTotp, setAngelTotp] = useState("");
  const [angelSaved, setAngelSaved] = useState(false);
  const [angelEditing, setAngelEditing] = useState(true);
  const [angelDisabled, setAngelDisabled] = useState(false);
  const [angelMsg, setAngelMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [angelSaving, setAngelSaving] = useState(false);
  // ── Weather Effect on Market ──
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [weatherInfluence, setWeatherInfluence] = useState(1);
  // ── Wallet (summary only — full wallet lives at /aqea/wallet) ──
  const navigate = useNavigate();
  const [walletTotal, setWalletTotal] = useState<{ usdt: number; inrEquivalent: number } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const refreshWalletTab = useCallback(async () => {
    setWalletLoading(true);
    try {
      const [spot, futures] = await Promise.all([
        api.getWalletBalance("PAPER", "SPOT").catch(() => null),
        api.getWalletBalance("PAPER", "FUTURES").catch(() => null),
      ]);
      const usdt = (spot?.usdt || 0) + (futures?.usdt || 0);
      const inrEquivalent = (spot?.inrEquivalent || 0) + (futures?.inrEquivalent || 0);
      setWalletTotal({ usdt, inrEquivalent });
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "WALLET") return;
    refreshWalletTab();
  }, [tab, refreshWalletTab]);

  // Load weather effect state once on mount (used by both Risk Control + AI Models tabs).
  useEffect(() => {
    let alive = true;
    api.getWeatherEffect()
      .then((w: any) => { if (alive && w) { setWeatherEnabled(w.enabled); setWeatherInfluence(w.influence ?? 1); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (tab !== "AI_MODELS") return;
    let alive = true;
    setModelsLoading(true);
    setModelsError(null);
    api.getModels()
      .then((res: any) => { if (alive) setAiModels(res?.models || []); })
      .catch((e: any) => { if (alive) setModelsError(e?.message || "Failed to load models"); })
      .finally(() => { if (alive) setModelsLoading(false); });
    return () => { alive = false; };
  }, [tab]);

  const fetchServices = useCallback(() => {
    setSvcLoading(true);
    api.getServicesStatus()
      .then((d: any) => setServices(d))
      .catch(() => {})
      .finally(() => setSvcLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "SERVICES") return;
    fetchServices();
    const iv = setInterval(fetchServices, 5000);
    return () => clearInterval(iv);
  }, [tab, fetchServices]);

  const fetchExtStatus = useCallback(() => {
    setExtLoading(true);
    api.getExternalSyncStatus()
      .then((d: any) => { setExtStatus(d); setExtError(null); })
      .catch((e: any) => setExtError(e?.message || "Failed to load sync status"))
      .finally(() => setExtLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "EXTERNAL_SYNC") return;
    fetchExtStatus();
    const iv = setInterval(fetchExtStatus, 10000);
    return () => clearInterval(iv);
  }, [tab, fetchExtStatus]);

  const handleExtAction = async (action: string) => {
    setExtAction(action);
    setExtError(null);
    try {
      if (action === "time")          await api.syncBinanceTime();
      if (action === "exchange_info") await api.refreshExchangeInfo();
      if (action === "account")       setExtAccount(await api.syncLiveAccount());
      fetchExtStatus();
    } catch (e: any) {
      setExtError(e?.message || "Sync failed");
    } finally {
      setExtAction(null);
    }
  };

  const agoLabel = (ts?: number | null) => {
    if (!ts) return "never";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const handleSvcAction = async (action: string) => {
    setSvcAction(action);
    try {
      if (action === "quant_start")   await api.startQuant();
      if (action === "quant_stop")    await api.stopQuant();
      if (action === "quant_restart") await api.restartQuant();
      if (action === "server_restart") {
        await api.restartServer();
        // Server will be down briefly — poll until it comes back
        setTimeout(() => fetchServices(), 3000);
      }
      if (action === "client_reload") { window.location.reload(); return; }
      setTimeout(fetchServices, 1500);
    } catch {}
    finally { setSvcAction(null); }
  };

  const handleToggleWeather = async (enabled: boolean) => {
    setWeatherEnabled(enabled);
    try { await api.setWeatherEffect({ enabled }); }
    catch (e: any) { setWeatherEnabled(!enabled); setModelsError(e?.message || "Weather toggle failed"); }
  };

  const handleWeatherInfluence = async (influence: number) => {
    setWeatherInfluence(influence);
    try { await api.setWeatherEffect({ influence }); }
    catch (e: any) { setModelsError(e?.message || "Weather update failed"); }
  };

  const handleToggleModel = async (id: string, enabled: boolean) => {
    // optimistic update
    setAiModels((prev) => prev.map((m) => (m.id === id ? { ...m, enabled } : m)));
    try {
      await api.toggleModel(id, enabled);
    } catch (e: any) {
      // revert on failure
      setAiModels((prev) => prev.map((m) => (m.id === id ? { ...m, enabled: !enabled } : m)));
      setModelsError(e?.message || "Toggle failed");
    }
  };
  const TogglePill = ({
    enabled,
    onClick,
  }: {
    enabled: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={enabled}
      className={clsx(
        "btn border-0 rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-sm",
        enabled
          ? "bg-success text-white"
          : "bg-secondary bg-opacity-10 text-secondary border border-financial"
      )}
    >
      {enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {enabled ? "ON" : "OFF"}
    </button>
  );

  /* local state for forms */
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [keysSaved, setKeysSaved] = useState(false);
  const [apiKeyDisplay, setApiKeyDisplay] = useState("");
  const [apiSecretDisplay, setApiSecretDisplay] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [coinMsg, setCoinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSym, setSavingSym] = useState(false);
  const [newSym, setNewSym] = useState("");
  const [localSymbols, setLocalSymbols] = useState<string[]>([...allowedSymbols]);

  useEffect(() => {
    setLocalSymbols([...allowedSymbols]);
  }, [allowedSymbols]);

  useEffect(() => {
    if (tab === "API_KEYS") {
      api.getApiKeysStatus().then((res) => {
        setKeysSaved(res.saved);
        if (res.saved) {
          setApiKeyDisplay(res.apiKey || "••••••••••••••••••••");
          setApiSecretDisplay(res.apiSecret || "••••••••••••••••••••");
        } else {
          setApiKeyDisplay("");
          setApiSecretDisplay("");
        }
        api.getSettings().then((s: any) => {
          if (s) {
            const hasKeys = !!(s.angelOneApiKey || s.angelOneClientCode);
            setAngelSaved(hasKeys);
            setAngelEditing(!hasKeys);
            setAngelDisabled(!!s.angelOneDisabled);
            if (s.angelOneApiKey) setAngelApiKey(s.angelOneApiKey);
            if (s.angelOneClientCode) setAngelClientCode(s.angelOneClientCode);
            if (s.angelOnePin) setAngelPin(s.angelOnePin);
            if (s.angelOneTotpSecret) setAngelTotp(s.angelOneTotpSecret);
          }
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [tab]);

  const handleSaveSymbols = async () => {
    setSavingSym(true);
    setCoinMsg({ ok: true, text: "SYNCING_WITH_NODE..." });
    try {
      if (connected) await api.updateSettings({ allowedSymbols: localSymbols });
      setAllowedSymbols(localSymbols);
      setCoinMsg({ ok: true, text: "SYMBOLS_BUFFER_SYNCED" });
      setTimeout(() => setCoinMsg(null), 5000);
    } catch (err: any) {
      setCoinMsg({ ok: false, text: `ERROR: ${err.message}` });
    } finally {
      setSavingSym(false);
    }
  };

  const handleAddCoin = () => {
    const sym = newSym.trim().toUpperCase();
    if (!sym) return;
    if (localSymbols.includes(sym)) {
      setCoinMsg({ ok: false, text: "DUPLICATE_SYMBOL_REJECTED" });
      setTimeout(() => setCoinMsg(null), 3000);
      return;
    }
    setLocalSymbols(p => [...p, sym]);
    setNewSym("");
    setCoinMsg({ ok: true, text: `ADDED ${sym} TO BUFFER` });
    setTimeout(() => setCoinMsg(null), 3000);
  };

  const handleRemoveCoin = (sym: string) => {
    setLocalSymbols(p => p.filter(x => x !== sym));
    setCoinMsg({ ok: true, text: `REMOVED ${sym} FROM BUFFER` });
    setTimeout(() => setCoinMsg(null), 3000);
  };

  const TabButton = ({ t, active }: { t: string, active: boolean }) => (
     <button
        onClick={() => setTab(t)}
        className={clsx(
           "nav-link text-start py-4 px-4 d-flex align-items-center gap-3 border-0 transition-all font-bold",
           active ? "bg-white text-primary shadow-sm border-start border-4 border-primary" : "text-secondary hover:text-dark hover:bg-light"
        )}
     >
        <span className="text-[11px] uppercase tracking-widest">{t.replace('_', ' ')}</span>
     </button>
  );

  return (
    <div className="container-fluid py-2 fade-in">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 mb-5 border-bottom border-financial pb-4">
        <div className="d-flex align-items-center gap-4">
           <div className="bg-primary bg-opacity-10 border border-primary border-opacity-20 rounded-financial p-3 shadow-sm">
              <SettingsIcon size={24} className="text-primary" />
           </div>
           <div>
              <h1 className="text-3xl font-bold text-dark tracking-tight uppercase m-0">Account Settings</h1>
              <p className="text-secondary font-medium mt-1">Configure node parameters and institutional security protocols</p>
           </div>
        </div>
      </div>

      <div className="row g-4">
         {/* Sidebar Navigation */}
         <div className="col-12 col-lg-3">
            <div className="card-modern border-0 overflow-hidden bg-white shadow-sm">
               <nav className="nav flex-column settings-tab-nav">
                  {TABS.map(t => <TabButton key={t} t={t} active={tab === t} />)}
               </nav>
               <div className="p-4 mt-5 bg-light bg-opacity-50 border-top border-financial settings-nav-footer">
                  <div className="d-flex align-items-center gap-2 mb-2">
                     <Monitor size={14} className="text-secondary" />
                     <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">Node: PRODUCTION</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                     <Cloud size={14} className="text-success" />
                     <span className="text-[10px] text-success font-bold uppercase tracking-wider">Cloud Sync: ACTIVE</span>
                  </div>
               </div>
            </div>
         </div>

         {/* Content Area */}
         <div className="col-12 col-lg-9">
            <div className="card-modern border-0 h-100 p-4 p-xl-5 shadow-sm">
               
               {tab === "API_KEYS" && (
                  <div className="fade-in max-w-2xl">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Key size={20} className="text-primary" />
                        <h4 className="text-dark font-bold tracking-tight m-0">Financial Connectivity Layer</h4>
                     </div>
                     <p className="text-secondary text-sm mb-5 font-medium">Authentication credentials are encrypted using bank-grade AES-256 protocols. Required for high-frequency routing.</p>
                     
                     <div className="mb-4">
                        <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-2 d-block">Binance API Key</label>
                        <input 
                          className="form-control form-control-modern font-mono text-sm" 
                          placeholder={keysSaved ? apiKeyDisplay : "Enter public API key..."}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                     </div>
                     <div className="mb-5">
                        <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-2 d-block">Secret Key</label>
                        <input 
                          className="form-control form-control-modern font-mono text-sm" 
                          type="password" 
                          placeholder={keysSaved ? apiSecretDisplay : "Enter private secret key..."}
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                        />
                     </div>
                     
                     <div className="d-flex gap-3 align-items-center flex-wrap">
                        <button 
                          onClick={async () => {
                            if (!apiKey || !apiSecret) {
                              setKeyMsg({ ok: false, text: "PLEASE_ENTER_KEYS" });
                              return;
                            }
                            setKeyMsg({ ok: true, text: "SAVING..." });
                            try {
                              await api.saveApiKeys(apiKey, apiSecret);
                              setKeyMsg({ ok: true, text: "KEYS_ENCRYPTED_AND_STORED" });
                              setKeysSaved(true);
                              setApiKeyDisplay("••••••••••••••••••••");
                              setApiSecretDisplay("••••••••••••••••••••");
                              setApiKey("");
                              setApiSecret("");
                            } catch (err: any) {
                              setKeyMsg({ ok: false, text: err.message });
                            }
                          }}
                          className="btn btn-financial btn-financial-primary px-4 py-2.5 shadow-sm"
                        >
                          Update Credentials
                        </button>
                        <button 
                          onClick={async () => {
                            setKeyMsg({ ok: true, text: "VERIFYING..." });
                            try {
                              let res;
                              if (apiKey && apiSecret) {
                                res = await api.testApiKeysRaw(apiKey, apiSecret);
                              } else {
                                res = await api.testApiKeys();
                              }
                              if (res.ok) {
                                setKeyMsg({ ok: true, text: "HANDSHAKE_SUCCESSFUL: CONNECTED" });
                              } else {
                                setKeyMsg({ ok: false, text: "HANDSHAKE_FAILED" });
                              }
                            } catch (err: any) {
                              setKeyMsg({ ok: false, text: `REJECT: ${err.message}` });
                            }
                          }}
                          className="btn btn-light border border-financial rounded-financial px-4 py-2.5 font-bold text-xs text-secondary"
                        >
                          Verify Handshake
                        </button>
                        {keysSaved && (
                          <button 
                            onClick={async () => {
                              if (!confirm("Are you sure you want to delete these credentials?")) return;
                              setKeyMsg({ ok: true, text: "DELETING..." });
                              try {
                                await api.deleteApiKeys();
                                setKeysSaved(false);
                                setApiKey("");
                                setApiSecret("");
                                setApiKeyDisplay("");
                                setApiSecretDisplay("");
                                setKeyMsg({ ok: true, text: "CREDENTIALS_DELETED" });
                              } catch (err: any) {
                                setKeyMsg({ ok: false, text: err.message });
                              }
                            }}
                            className="btn btn-outline-danger rounded-financial px-4 py-2.5 font-bold text-xs"
                          >
                            Delete Credentials
                          </button>
                        )}
                        {keyMsg && (
                          <div className={clsx("text-[10px] font-bold uppercase tracking-widest mt-2 w-100", keyMsg.ok ? "text-success" : "text-danger")}>
                            {keyMsg.text}
                          </div>
                        )}
                     </div>

                      {/* 🇮🇳 Angel One SmartAPI (NSE / BSE Indian Market) */}
                      <div className="pt-4 border-top border-financial mt-5">
                         <div className="d-flex align-items-center justify-content-between mb-3">
                            <div className="d-flex align-items-center gap-3">
                               <Landmark size={20} className="text-warning" />
                               <h4 className="text-dark font-bold tracking-tight m-0">Angel One SmartAPI Credentials (NSE / BSE India)</h4>
                            </div>
                            {angelSaved && (
                               <span className={clsx("badge font-bold px-3 py-1.5 rounded-full text-xs d-flex align-items-center gap-1.5", angelDisabled ? "bg-secondary text-white" : "bg-success bg-opacity-10 text-success border border-success border-opacity-20")}>
                                  <span className={clsx("w-2 h-2 rounded-full", angelDisabled ? "bg-secondary" : "bg-success")} />
                                  {angelDisabled ? "EXECUTION_DISABLED" : "ACTIVE_CONNECTED"}
                               </span>
                            )}
                         </div>
                         <p className="text-secondary text-sm mb-4 font-medium">Connect your Angel One SmartAPI for Indian Equity & Derivatives trading in Indian Rupees (₹ INR).</p>

                         <div className="row g-3 mb-4">
                            <div className="col-12 col-md-6">
                               <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-1 d-block">SmartAPI App Key</label>
                               <input 
                                 disabled={!angelEditing && angelSaved}
                                 className="form-control form-control-modern font-mono text-sm"
                                 placeholder={angelSaved && !angelEditing ? "••••••••••••••••••••" : "Enter Angel One API Key..."}
                                 value={angelApiKey}
                                 onChange={(e) => setAngelApiKey(e.target.value)}
                               />
                            </div>
                            <div className="col-12 col-md-6">
                               <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-1 d-block">Client Code (Client ID)</label>
                               <input 
                                 disabled={!angelEditing && angelSaved}
                                 className="form-control form-control-modern font-mono text-sm"
                                 placeholder={angelSaved && !angelEditing ? "••••••••" : "e.g. A123456"}
                                 value={angelClientCode}
                                 onChange={(e) => setAngelClientCode(e.target.value)}
                               />
                            </div>
                            <div className="col-12 col-md-6">
                               <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-1 d-block">4-Digit MPIN</label>
                               <input 
                                 disabled={!angelEditing && angelSaved}
                                 type="password"
                                 maxLength={4}
                                 className="form-control form-control-modern font-mono text-sm"
                                 placeholder={angelSaved && !angelEditing ? "••••" : "Enter 4-digit PIN..."}
                                 value={angelPin}
                                 onChange={(e) => setAngelPin(e.target.value)}
                               />
                            </div>
                            <div className="col-12 col-md-6">
                               <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-1 d-block">TOTP Secret Key</label>
                               <input 
                                 disabled={!angelEditing && angelSaved}
                                 type="password"
                                 className="form-control form-control-modern font-mono text-sm"
                                 placeholder={angelSaved && !angelEditing ? "••••••••••••••••••••" : "Enter TOTP Secret for auto-login..."}
                                 value={angelTotp}
                                 onChange={(e) => setAngelTotp(e.target.value)}
                               />
                            </div>
                         </div>

                         <div className="d-flex gap-3 align-items-center flex-wrap">
                            <button
                              disabled={angelSaving}
                              onClick={async () => {
                                if (!angelApiKey || !angelClientCode) {
                                  setAngelMsg({ ok: false, text: "PLEASE_ENTER_API_KEY_AND_CLIENT_CODE" });
                                  return;
                                }
                                setAngelSaving(true);
                                setAngelMsg({ ok: true, text: "ENCRYPTING_AND_STORING_ANGEL_ONE_CREDENTIALS..." });
                                try {
                                  await api.updateSettings({
                                    angelOneApiKey: angelApiKey,
                                    angelOneClientCode: angelClientCode,
                                    angelOnePin: angelPin,
                                    angelOneTotpSecret: angelTotp,
                                    angelOneDisabled: angelDisabled,
                                  });
                                  setAngelSaved(true);
                                  setAngelEditing(false);
                                  setAngelApiKey("");
                                  setAngelClientCode("");
                                  setAngelPin("");
                                  setAngelTotp("");
                                  setAngelMsg({ ok: true, text: "ANGEL_ONE_CREDENTIALS_STORED_SECURELY" });
                                } catch (err: any) {
                                  setAngelMsg({ ok: false, text: `ERROR: ${err.message}` });
                                } finally {
                                  setAngelSaving(false);
                                }
                              }}
                              className="btn btn-warning text-dark font-bold px-4 py-2.5 shadow-sm"
                            >
                              {angelSaved ? "Update Credentials" : "Save Credentials"}
                            </button>

                            <button
                              onClick={async () => {
                                setAngelMsg({ ok: true, text: "VERIFYING_ANGEL_ONE_HANDSHAKE..." });
                                try {
                                  const res = await fetch("/apikeys/angel-one/test", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ apiKey: angelApiKey || "saved", clientCode: angelClientCode || "saved" })
                                  });
                                  if (res.ok) {
                                    setAngelMsg({ ok: true, text: "ANGEL_ONE_HANDSHAKE_SUCCESSFUL: CONNECTED TO NSE/BSE GATEWAY" });
                                  } else {
                                    setAngelMsg({ ok: false, text: "ANGEL_ONE_HANDSHAKE_FAILED" });
                                  }
                                } catch (err: any) {
                                  setAngelMsg({ ok: false, text: `REJECT: ${err.message}` });
                                }
                              }}
                              className="btn btn-light border border-financial rounded-financial px-4 py-2.5 font-bold text-xs text-secondary"
                            >
                              Verify Handshake
                            </button>

                            {angelSaved && (
                              <button
                                onClick={() => setAngelEditing((p: boolean) => !p)}
                                className="btn btn-outline-primary rounded-financial px-4 py-2.5 font-bold text-xs"
                              >
                                {angelEditing ? "Lock Fields" : "Edit Credentials"}
                              </button>
                            )}

                            {angelSaved && (
                              <button
                                onClick={async () => {
                                  const nextState = !angelDisabled;
                                  setAngelDisabled(nextState);
                                  await api.updateSettings({ angelOneDisabled: nextState });
                                  setAngelMsg({ ok: true, text: nextState ? "ANGEL_ONE_TRADING_DISABLED" : "ANGEL_ONE_TRADING_ENABLED" });
                                }}
                                className={clsx("btn rounded-financial px-4 py-2.5 font-bold text-xs", angelDisabled ? "btn-outline-success" : "btn-outline-warning")}
                              >
                                {angelDisabled ? "Enable Execution" : "Disable Execution"}
                              </button>
                            )}

                            {angelSaved && (
                              <button
                                onClick={async () => {
                                  if (!confirm("Delete Angel One credentials?")) return;
                                  await api.updateSettings({
                                    angelOneApiKey: "",
                                    angelOneClientCode: "",
                                    angelOnePin: "",
                                    angelOneTotpSecret: "",
                                  });
                                  setAngelSaved(false);
                                  setAngelEditing(true);
                                  setAngelApiKey("");
                                  setAngelClientCode("");
                                  setAngelPin("");
                                  setAngelTotp("");
                                  setAngelMsg({ ok: true, text: "ANGEL_ONE_CREDENTIALS_DELETED" });
                                }}
                                className="btn btn-outline-danger rounded-financial px-4 py-2.5 font-bold text-xs"
                              >
                                Delete Credentials
                              </button>
                            )}

                            {angelMsg && (
                              <div className={clsx("text-[10px] font-bold uppercase tracking-widest mt-2 w-100", angelMsg.ok ? "text-success" : "text-danger")}>
                                {angelMsg.text}
                              </div>
                            )}
                         </div>
                      </div>
                  </div>
               )}

               {tab === "THEME_ENGINE" && (
                  <div className="fade-in max-w-2xl">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Layout size={20} className="text-primary" />
                        <h4 className="text-dark font-bold tracking-tight m-0">Interface Orchestration</h4>
                     </div>
                     <p className="text-secondary text-sm mb-5 font-medium">Configure terminal aesthetics and information density for institutional performance.</p>
                     
                     <div className="mb-5">
                        <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-3 d-block">Visual Theme</label>
                        <div className="row g-3">
                           {THEMES.map(t => (
                              <div key={t.id} className="col-12 col-md-6 col-lg-4">
                                 <button
                                    onClick={() => setTheme(t.id)}
                                    className={clsx(
                                       "btn w-100 p-3 border text-start rounded-financial transition-all d-flex align-items-center gap-3",
                                       theme === t.id ? "bg-white border-primary border-2 shadow-sm" : "bg-light border-financial hover:border-primary"
                                    )}
                                 >
                                    {/* swatch preview: surface + accent */}
                                    <span style={{ display:"inline-flex", flexShrink:0, width:36, height:36, borderRadius:8, overflow:"hidden", border:"1px solid rgba(0,0,0,0.1)" }}>
                                       <span style={{ width:"50%", background:t.swatch[0] }} />
                                       <span style={{ width:"50%", background:t.swatch[1] }} />
                                    </span>
                                    <span>
                                       <div className="text-xs font-bold text-dark uppercase mb-1 d-flex align-items-center gap-2">
                                          {t.label}
                                          {theme === t.id && <span className="text-[8px] font-black text-primary">● ACTIVE</span>}
                                       </div>
                                       <div className="text-[10px] text-secondary font-medium">{t.desc}</div>
                                    </span>
                                 </button>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div>
                        <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-3 d-block">Information Density</label>
                        <div className="row g-3">
                           {([
                              { id: 'COMPACT', label: 'Compact', desc: 'Maximum data, minimum whitespace' },
                              { id: 'COMFORTABLE', label: 'Comfortable', desc: 'Balanced spacing for analysis' },
                              { id: 'SPACIOUS', label: 'Spacious', desc: 'Clean layout for presentation' }
                           ] as const).map(d => (
                              <div key={d.id} className="col-12 col-md-4">
                                 <button 
                                    onClick={() => setDensity(d.id)}
                                    className={clsx(
                                       "btn w-100 p-4 border text-start rounded-financial transition-all",
                                       density === d.id ? "bg-white border-primary border-2 shadow-sm" : "bg-light border-financial hover:border-primary"
                                    )}
                                 >
                                    <div className="text-xs font-bold text-dark uppercase mb-1">{d.label}</div>
                                    <div className="text-[10px] text-secondary font-medium">{d.desc}</div>
                                 </button>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               )}

               {tab === "MANAGE_COINS" && (
                   <div className="fade-in">
                      <div className="d-flex align-items-center gap-3 mb-4">
                         <Coins size={20} className="text-primary" />
                         <h4 className="text-dark font-bold tracking-tight m-0">Asset Scanning Cluster</h4>
                      </div>
                      <p className="text-secondary text-sm mb-5 font-medium">Define high-conviction pairs for multi-exchange orderbook ingestion and AI scanning.</p>
                      
                      <div className="row g-3 mb-5">
                         {localSymbols.map(s => (
                            <div key={s} className="col-auto">
                               <div className="d-flex align-items-center gap-3 bg-light border border-financial px-4 py-2 rounded-financial group hover:border-danger transition-all">
                                  <span className="text-sm font-bold text-dark">{s}</span>
                                  <button onClick={() => handleRemoveCoin(s)} className="btn btn-link p-0 text-secondary hover:text-danger">
                                     <Trash2 size={14} />
                                  </button>
                               </div>
                            </div>
                         ))}
                      </div>

                      <div className="d-flex gap-3 align-items-center" style={{ maxWidth: '480px' }}>
                         <input 
                            className="form-control form-control-modern font-bold text-sm uppercase" 
                            placeholder="SYMBOL_ID (e.g. BTCUSDT)..." 
                            value={newSym}
                            onChange={(e) => setNewSym(e.target.value.toUpperCase())}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddCoin(); }}
                         />
                         <button 
                            onClick={handleAddCoin}
                            className="btn btn-light border border-financial rounded-financial px-4 py-2 font-bold text-sm text-secondary hover:text-primary transition-all flex items-center justify-center"
                            style={{ height: '42px' }}
                         >
                            <Plus size={20} />
                         </button>
                      </div>

                      <div className="mt-5 pt-5 border-top border-light d-flex align-items-center gap-4">
                         <button 
                            onClick={handleSaveSymbols}
                            disabled={savingSym}
                            className="btn btn-financial btn-financial-primary px-4 py-2.5 d-flex align-items-center gap-2 shadow-sm"
                         >
                            <Save size={16} /> Sync Buffer
                         </button>
                         {coinMsg && (
                            <div className={clsx("text-[10px] font-bold uppercase tracking-widest transition-all", coinMsg.ok ? "text-success" : "text-danger")}>
                               {coinMsg.text}
                            </div>
                         )}
                      </div>
                   </div>
                )}

               {tab === "RISK_CONTROL" && (
                  <div className="fade-in">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <ShieldCheck size={20} className="text-danger" />
                        <h4 className="text-dark font-bold tracking-tight m-0">Institutional Risk Parameters</h4>
                     </div>

                     {/* ── AQEA Signal Thresholds ── */}
                     <div className="mb-5 p-4 border-2 border-indigo-200 rounded-financial" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}>
                        <div className="d-flex align-items-center gap-2 mb-1">
                           <Activity size={15} className="text-indigo-600" />
                           <span className="text-xs font-black text-indigo-700 uppercase tracking-widest">AQEA Signal Thresholds</span>
                        </div>
                        <p className="text-[11px] text-indigo-500 mb-4 font-medium">Score range 0–100. LONG fires above the LONG cutoff; SHORT fires below the SHORT cutoff. Zone between = HOLD.</p>
                        
                      {/* 24/7 Crypto Auto-Trade Master Power Switch */}
                      <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 14, background: execMode === "AUTO" ? "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)" : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: execMode === "AUTO" ? "1px solid #a7f3d0" : "1px solid #cbd5e1" }}>
                         <div className="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
                            <div className="d-flex align-items-center gap-3">
                               <div className={clsx("p-3 rounded-circle shadow-sm d-flex align-items-center justify-content-center", execMode === "AUTO" ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-700")}>
                                  {execMode === "AUTO" ? <Power size={22} /> : <PowerOff size={22} />}
                               </div>
                               <div>
                                  <div className="d-flex align-items-center gap-2 mb-1">
                                     <span className="font-black text-dark text-base tracking-tight">24/7 Crypto Auto-Trading Engine</span>
                                     <span className={clsx("text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-pill", execMode === "AUTO" ? "bg-emerald-200 text-emerald-800" : "bg-slate-200 text-slate-700")}>
                                        {execMode === "AUTO" ? "🤖 AUTO-TRADER ACTIVE" : "🖐️ MANUAL MODE"}
                                     </span>
                                  </div>
                                  <p className="text-xs text-secondary m-0">
                                     {execMode === "AUTO"
                                        ? "AQEA 24/7 AI Engine is actively scanning crypto market pairs and automatically placing trades."
                                        : "Auto-trading is currently PAUSED. Orders will only be placed manually."}
                                  </p>
                               </div>
                            </div>
                            <button
                               onClick={() => setExecMode(execMode === "AUTO" ? "MANUAL" : "AUTO")}
                               className={clsx("btn px-4 py-2.5 rounded-pill font-black text-xs uppercase tracking-widest shadow-sm d-flex align-items-center gap-2 border-0 transition-all", execMode === "AUTO" ? "btn-danger" : "btn-success")}
                            >
                               {execMode === "AUTO" ? <PowerOff size={16} /> : <Power size={16} />}
                               {execMode === "AUTO" ? "Turn Auto-Trade OFF" : "Turn Auto-Trade ON"}
                            </button>
                         </div>
                      </div>

                      <div className="row g-4">
                           {/* LONG threshold */}
                           <div className="col-12 col-md-6">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                 <span className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">LONG Entry Cutoff</span>
                                 <span className="text-lg font-black text-emerald-600 font-mono bg-white px-3 py-1 rounded-pill shadow-sm border border-emerald-100">{autoTradeThreshold}</span>
                              </div>
                              <input type="range" className="form-range" min="40" max="95" step="1"
                                 value={autoTradeThreshold}
                                 onChange={e => setAutoTradeThreshold(parseInt(e.target.value))}
                                 style={{ accentColor: '#059669' }}
                              />
                              <div className="d-flex justify-content-between mt-1 text-[10px] font-bold text-indigo-400 uppercase">
                                 <span>40 Aggressive</span>
                                 <span>62 Balanced</span>
                                 <span>85 Safe</span>
                              </div>
                           </div>
                           {/* SHORT threshold */}
                           <div className="col-12 col-md-6">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                 <span className="text-[11px] font-black text-rose-700 uppercase tracking-widest">SHORT Entry Cutoff</span>
                                 <span className="text-lg font-black text-rose-600 font-mono bg-white px-3 py-1 rounded-pill shadow-sm border border-rose-100">{shortScoreThreshold}</span>
                              </div>
                              <input type="range" className="form-range" min="5" max="50" step="1"
                                 value={shortScoreThreshold}
                                 onChange={e => setShortScoreThreshold(parseInt(e.target.value))}
                                 style={{ accentColor: '#e11d48' }}
                              />
                              <div className="d-flex justify-content-between mt-1 text-[10px] font-bold text-indigo-400 uppercase">
                                 <span>5 Aggressive</span>
                                 <span>35 Balanced</span>
                                 <span>50 Conservative</span>
                              </div>
                           </div>
                        </div>
                        {/* Visual score band */}
                        <div className="mt-4 pt-3 border-top border-indigo-100">
                           <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2">Current signal band</div>
                           <div className="position-relative rounded-pill overflow-hidden" style={{ height: 12, background: '#e0e7ff' }}>
                              <div className="position-absolute top-0 bottom-0 bg-rose-400 rounded-pill" style={{ left: 0, width: `${shortScoreThreshold}%` }} />
                              <div className="position-absolute top-0 bottom-0 bg-emerald-400 rounded-pill" style={{ left: `${autoTradeThreshold}%`, right: 0 }} />
                           </div>
                           <div className="d-flex justify-content-between mt-1 text-[10px] font-bold uppercase">
                              <span className="text-rose-500">SHORT zone &lt;{shortScoreThreshold}</span>
                              <span className="text-indigo-400">HOLD zone {shortScoreThreshold}–{autoTradeThreshold}</span>
                              <span className="text-emerald-500">LONG zone &gt;{autoTradeThreshold}</span>
                           </div>
                        </div>

                        {/* ── Agentic flip-exit profit gate ── */}
                        <div className="mt-4 pt-3 border-top border-indigo-100">
                           <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">Flip-Exit Profit Gate (R)</span>
                              <span className="text-lg font-black text-indigo-600 font-mono bg-white px-3 py-1 rounded-pill shadow-sm border border-indigo-100">{aiFlipExitMinProfitR.toFixed(1)}R</span>
                           </div>
                           <p className="text-[11px] text-indigo-500 mb-2 font-medium">When the AI trend flips against an open position, bank the profit only once it's at least this many R (risk-multiples) in profit. 0 = exit on any profit; higher = let winners run further before flipping out.</p>
                           <input type="range" className="form-range" min="0" max="3" step="0.1"
                              value={aiFlipExitMinProfitR}
                              onChange={e => setAiFlipExitMinProfitR(parseFloat(e.target.value))}
                              style={{ accentColor: '#4f46e5' }}
                           />
                           <div className="d-flex justify-content-between mt-1 text-[10px] font-bold text-indigo-400 uppercase">
                              <span>0 Any profit</span>
                              <span>0.3 Balanced</span>
                              <span>3 Patient</span>
                           </div>
                        </div>
                     </div>

                     <div className="row g-5">
                        <div className="col-12 col-md-6 border-end border-light pe-md-5">

                           {/* ── Drift Monitor Thresholds ── */}
                           <div className="mb-5 p-4 border border-amber-200 rounded-financial" style={{ background: '#fffbeb' }}>
                              <div className="d-flex align-items-center gap-2 mb-1">
                                 <AlertTriangle size={14} className="text-amber-600" />
                                 <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Capital Drift Monitor</span>
                              </div>
                              <p className="text-[11px] text-amber-600 mb-4 font-medium">Measures strategy drift from expected behaviour. Above Reduce → risk halved. Above Halt → all new entries blocked.</p>
                              <div className="mb-4">
                                 <div className="d-flex justify-content-between align-items-center mb-2">
                                    <span className="text-[11px] font-bold text-amber-700 uppercase">Reduce Risk at drift &gt;</span>
                                    <span className="text-base font-black text-amber-600 font-mono bg-white px-2 py-1 rounded-pill border border-amber-100">{driftReduceThreshold}</span>
                                 </div>
                                 <input type="range" className="form-range" min="30" max="80" step="5"
                                    value={driftReduceThreshold}
                                    onChange={e => setDriftReduceThreshold(parseInt(e.target.value))}
                                    style={{ accentColor: '#d97706' }}
                                 />
                              </div>
                              <div>
                                 <div className="d-flex justify-content-between align-items-center mb-2">
                                    <span className="text-[11px] font-bold text-rose-700 uppercase">Halt Entries at drift &gt;</span>
                                    <span className="text-base font-black text-rose-600 font-mono bg-white px-2 py-1 rounded-pill border border-rose-100">{driftHaltThreshold}</span>
                                 </div>
                                 <input type="range" className="form-range" min="50" max="100" step="5"
                                    value={driftHaltThreshold}
                                    onChange={e => setDriftHaltThreshold(parseInt(e.target.value))}
                                    style={{ accentColor: '#e11d48' }}
                                 />
                                 {driftHaltThreshold <= driftReduceThreshold && (
                                    <p className="text-[10px] text-danger font-bold mt-1 mb-0">⚠ Halt threshold must be above Reduce threshold.</p>
                                 )}
                              </div>
                           </div>

                           {/* ── Saraswati Alpha Threshold ── */}
                           <div className="mb-5 p-4 border border-purple-200 rounded-financial" style={{ background: '#faf5ff' }}>
                              <div className="d-flex align-items-center gap-2 mb-1">
                                 <Cpu size={14} className="text-purple-600" />
                                 <span className="text-xs font-black text-purple-700 uppercase tracking-widest">Saraswati Alpha Threshold</span>
                              </div>
                              <p className="text-[11px] text-purple-500 mb-3 font-medium">Minimum expected value score (0–100) for Saraswati reasoning to APPROVE an entry. Affects the Agent Recommendation panel only — not the live autotrader.</p>
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                 <span className="text-[11px] font-bold text-purple-700 uppercase">Approval cutoff</span>
                                 <span className="text-base font-black text-purple-600 font-mono bg-white px-2 py-1 rounded-pill border border-purple-100">{saraswatiAlphaThreshold}</span>
                              </div>
                              <input type="range" className="form-range" min="20" max="75" step="1"
                                 value={saraswatiAlphaThreshold}
                                 onChange={e => setSaraswatiAlphaThreshold(parseInt(e.target.value))}
                                 style={{ accentColor: '#9333ea' }}
                              />
                              <div className="d-flex justify-content-between mt-1 text-[10px] font-bold text-purple-400 uppercase">
                                 <span>20 Lenient</span>
                                 <span>45 Default</span>
                                 <span>75 Strict</span>
                              </div>
                           </div>

                           {/* ── Aggressive Exposure Bias ── */}
                           <div className="mb-5">
                              <div className="d-flex justify-content-between mb-3 align-items-center">
                                 <span className="text-xs font-bold text-dark uppercase tracking-widest">Aggressive Exposure Bias</span>
                                 <span className="text-lg font-black text-emerald-600 font-mono">{riskLevel}%</span>
                              </div>
                              <input type="range" className="form-range" value={riskLevel} onChange={e => setRiskLevel(parseInt(e.target.value))}
                                style={{ accentColor: '#059669' }}
                              />
                              <div className="d-flex justify-content-between mt-3 font-bold text-[10px] text-secondary uppercase">
                                 <span>Passive</span>
                                 <span>Balanced</span>
                                 <span>Maximum</span>
                              </div>
                           </div>

                           {/* ── Hard Drawdown Cap ── */}
                           <div className="mb-5">
                              <div className="d-flex justify-content-between mb-3 align-items-center">
                                 <span className="text-xs font-bold text-dark uppercase tracking-widest">Hard Drawdown Cap</span>
                                 <span className="text-lg font-black text-rose-600 font-mono">{maxDrawdown}%</span>
                              </div>
                              <input type="range" className="form-range" min="1" max="100" step="1" value={maxDrawdown} onChange={e => setMaxDrawdown(parseInt(e.target.value))}
                                style={{ accentColor: '#e11d48' }}
                              />
                              <div className="d-flex justify-content-between mt-3 font-bold text-[10px] text-secondary uppercase">
                                 <span>1% Tight</span>
                                 <span>15% Standard</span>
                                 <span>100% Max</span>
                              </div>
                           </div>

                           {/* ── Stop Loss Threshold ── */}
                           <div className="mb-5">
                              <div className="d-flex justify-content-between mb-3 align-items-center">
                                 <span className="text-xs font-bold text-dark uppercase tracking-widest">Stop Loss Threshold (Min Distance)</span>
                                 <span className="text-lg font-black text-amber-600 font-mono">{defaultSL}%</span>
                              </div>
                              <input type="range" className="form-range" min="0.5" max="5.0" step="0.1" value={defaultSL} onChange={e => setDefaultSL(parseFloat(e.target.value))}
                                style={{ accentColor: '#d97706' }}
                              />
                              <div className="d-flex justify-content-between mt-3 font-bold text-[10px] text-secondary uppercase">
                                 <span>0.5% (Aggressive)</span>
                                 <span>1.5% (Standard)</span>
                                 <span>5.0% (Conservative)</span>
                              </div>
                           </div>
                        </div>

                        {/* ── Right Column: Toggle Switches ── */}
                        <div className="col-12 col-md-6 ps-md-5">
                           <div className="space-y-4">
                              <div className="d-flex justify-content-between align-items-center bg-indigo-50 border border-indigo-200 p-4 rounded-financial group hover:border-indigo-400 transition-all">
                                 <div>
                                    <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">High Precision Logic</div>
                                    <p className="text-xs text-indigo-600 m-0 font-bold">ONLY ULTRA-CONVICTION ENTRIES</p>
                                 </div>
                                 <TogglePill enabled={highPrecisionMode} onClick={() => setHighPrecisionMode(!highPrecisionMode)} />
                              </div>
                              <div className="d-flex justify-content-between align-items-center bg-emerald-50 border border-emerald-200 p-4 rounded-financial group hover:border-emerald-400 transition-all">
                                 <div>
                                    <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">Zero Loss Protection</div>
                                    <p className="text-xs text-emerald-600 m-0 font-bold">AGGRESSIVE BREAKEVEN GUARD</p>
                                 </div>
                                 <TogglePill enabled={noLossMode} onClick={() => setNoLossMode(!noLossMode)} />
                              </div>
                              <div className="d-flex justify-content-between align-items-center bg-amber-50 border border-amber-200 p-4 rounded-financial group hover:border-amber-400 transition-all">
                                 <div>
                                    <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">Dynamic SL/TP Mode</div>
                                    <p className="text-xs text-amber-600 m-0 font-bold">TRAIL STOPS VIA VOLATILITY & REGIMES</p>
                                 </div>
                                 <TogglePill enabled={dynamicSLTP} onClick={() => setDynamicSLTP(!dynamicSLTP)} />
                              </div>

                              {/* AI Consensus Gate */}
                              <div className="bg-sky-50 border border-sky-200 p-4 rounded-financial">
                                 <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                       <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">AI Consensus Gate</div>
                                       <p className="text-xs text-sky-600 m-0 font-bold">REQUIRE ALL AI MODELS TO AGREE BEFORE ENTRY</p>
                                    </div>
                                    <TogglePill enabled={aiConsensusGate} onClick={() => setAiConsensusGate(!aiConsensusGate)} />
                                 </div>
                                 {!aiConsensusGate && (
                                    <p className="text-[10px] text-amber-600 font-bold mt-2 mb-0 border-top border-sky-200 pt-2">⚠ Gate off — entries rely on score threshold only. Models may disagree.</p>
                                 )}
                              </div>

                              {/* Animal Behaviour Model — HIDDEN.
                                  The 10-animal scoring does NOT contribute to the live trade
                                  decision: autoTradeEngine uses AQEAEngine.decide() as the sole
                                  authority, and AQEA ignores animalBlend entirely. The old
                                  "30% to trade decision" claim was only true for the legacy
                                  decideAction()/recommend() path, which now only powers the
                                  manual /agent/recommendation endpoint. Toggle hidden to avoid
                                  misleading users; backend model left intact for that endpoint. */}
                              {false && (
                              <div className="bg-slate-50 border border-slate-200 p-4 rounded-financial">
                                 <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                       <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">Animal Behaviour Model</div>
                                       <p className="text-xs text-slate-500 m-0 font-bold">10-ANIMAL SCORING (legacy recommendation engine only)</p>
                                    </div>
                                    <TogglePill enabled={behaviourModelEnabled} onClick={() => setBehaviourModelEnabled(!behaviourModelEnabled)} />
                                 </div>
                                 {!behaviourModelEnabled && (
                                    <p className="text-[10px] text-amber-600 font-bold mt-2 mb-0 border-top border-slate-200 pt-2">Animal model disabled — trade scoring runs on regime + AI signals only.</p>
                                 )}
                              </div>
                              )}

                              {/* Technical Backup Mode */}
                              <div className="bg-slate-50 border border-slate-200 p-4 rounded-financial">
                                 <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                       <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">Technical Backup Trading</div>
                                       <p className="text-xs text-slate-500 m-0 font-bold">TRADE ON EMA / RSI / MACD WHEN AI ENGINE IS OFFLINE</p>
                                    </div>
                                    <TogglePill enabled={taFallbackEnabled} onClick={() => setTaFallbackEnabled(!taFallbackEnabled)} />
                                 </div>
                                 {taFallbackEnabled && (
                                    <div className="mt-3 pt-3 border-top border-slate-200">
                                       <div className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Apply To</div>
                                       <div className="d-flex gap-2">
                                          {([
                                             { id: "PAPER_ONLY", label: "Paper only", desc: "Live stays strict" },
                                             { id: "PAPER_AND_LIVE", label: "Paper + Live", desc: "Both degrade to TA" },
                                          ] as const).map((opt) => {
                                             const active = taFallbackScope === opt.id;
                                             return (
                                                <button key={opt.id} type="button" onClick={() => setTaFallbackScope(opt.id)}
                                                   className={clsx("flex-1 text-start p-2 rounded-financial border transition-all",
                                                      active ? "border-primary bg-primary bg-opacity-10" : "border-financial bg-white hover:border-slate-300")}
                                                >
                                                   <div className={clsx("text-xs font-black uppercase", active ? "text-primary" : "text-dark")}>{opt.label}</div>
                                                   <div className="text-[10px] text-secondary font-bold">{opt.desc}</div>
                                                </button>
                                             );
                                          })}
                                       </div>
                                       {taFallbackScope === "PAPER_AND_LIVE" && (
                                          <p className="text-[10px] text-danger font-bold mt-2 mb-0">⚠ Live capital will trade on technicals when AI is offline.</p>
                                       )}
                                    </div>
                                 )}
                              </div>

                              {/* Weather Effect on Market */}
                              <div className="d-flex justify-content-between align-items-center bg-cyan-50 border border-cyan-200 p-4 rounded-financial group hover:border-cyan-400 transition-all flex-wrap gap-3">
                                 <div className="flex-grow-1">
                                    <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">🌦 Weather Effect on Market</div>
                                    <p className="text-xs text-cyan-600 m-0 font-bold">WEATHER-DRIVEN RISK / REGIME / SIZING (OFF = NO TRADE IMPACT)</p>
                                 </div>
                                 <div className="flex-shrink-0 ms-auto">
                                    <TogglePill enabled={weatherEnabled} onClick={() => handleToggleWeather(!weatherEnabled)} />
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {tab === "AI_MODELS" && (
                  <div className="fade-in" style={{ maxWidth: "720px" }}>
                     <div className="d-flex align-items-center gap-3 mb-2">
                        <Layout size={20} className="text-primary" />
                        <h4 className="text-dark font-bold tracking-tight m-0">AI Model Governance & Admin Permissions</h4>
                     </div>
                     <p className="text-xs text-secondary mb-4">
                        Admin permissions allow models to participate in autonomous governance. Permitted models are evaluated continuously by AQEA for empirical performance, regime fit, and calibration before active deployment.
                     </p>

                     {modelsError && (
                        <div className="alert alert-danger py-2 px-3 text-xs mb-3">{modelsError}</div>
                     )}

                     {/* AQEA Voting Layers */}
                     <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-financial mb-4">
                        <div className="text-sm font-black text-dark uppercase tracking-tight mb-1">Autonomous Governance Permissions</div>
                        <p className="text-xs text-indigo-600 m-0 font-bold mb-2">ALLOW/DISALLOW SIGNAL LAYERS IN AUTONOMOUS CONTROL-PLANE ENSEMBLE</p>

                        {/* Microstructure */}
                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Order Flow Voting</div>
                              <p className="text-[10px] text-indigo-500 m-0">Microstructure buy/sell pressure</p>
                           </div>
                           <TogglePill enabled={orderFlowVotingEnabled} onClick={() => setOrderFlowVotingEnabled(!orderFlowVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Smart Money Voting</div>
                              <p className="text-[10px] text-indigo-500 m-0">Whale / liquidity sweep detection</p>
                           </div>
                           <TogglePill enabled={smartMoneyVotingEnabled} onClick={() => setSmartMoneyVotingEnabled(!smartMoneyVotingEnabled)} />
                        </div>

                        {/* Live News & NLP Sentiment */}
                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Live News &amp; NLP Sentiment Intelligence</div>
                              <p className="text-[10px] text-indigo-500 m-0">Real-time macro news, RBI/Fed &amp; earnings NLP sentiment</p>
                           </div>
                           <TogglePill enabled={liveNewsSentimentEnabled} onClick={() => setLiveNewsSentimentEnabled(!liveNewsSentimentEnabled)} />
                        </div>

                        {/* Global Crypto AI Models */}
                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">CNN Voting</div>
                              <p className="text-[10px] text-indigo-500 m-0">CNN 1D model vote (≥70% confidence)</p>
                           </div>
                           <TogglePill enabled={cnnVotingEnabled} onClick={() => setCnnVotingEnabled(!cnnVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Bi-Directional LSTM Voting</div>
                              <p className="text-[10px] text-indigo-500 m-0">Sequence momentum &amp; trend memory model</p>
                           </div>
                           <TogglePill enabled={lstmVotingEnabled} onClick={() => setLstmVotingEnabled(!lstmVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Transformer Micro</div>
                              <p className="text-[10px] text-indigo-500 m-0">Multi-head attention matrix model</p>
                           </div>
                           <TogglePill enabled={transformerVotingEnabled} onClick={() => setTransformerVotingEnabled(!transformerVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">PPO Execution Agent</div>
                              <p className="text-[10px] text-indigo-500 m-0">Reinforcement learning execution model</p>
                           </div>
                           <TogglePill enabled={ppoVotingEnabled} onClick={() => setPpoVotingEnabled(!ppoVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Mamba State Space</div>
                              <p className="text-[10px] text-indigo-500 m-0">Selective SSM sequence predictor</p>
                           </div>
                           <TogglePill enabled={mambaVotingEnabled} onClick={() => setMambaVotingEnabled(!mambaVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">LNN / xLSTM Engine</div>
                              <p className="text-[10px] text-indigo-500 m-0">Liquid neural network volatility model</p>
                           </div>
                           <TogglePill enabled={lnnVotingEnabled} onClick={() => setLnnVotingEnabled(!lnnVotingEnabled)} />
                        </div>

                        {/* Indian Market AI Models */}
                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Gayatri 24-Signal Frequency</div>
                              <p className="text-[10px] text-indigo-500 m-0">Harmonic resonance predictor (NSE/BSE)</p>
                           </div>
                           <TogglePill enabled={gayatriVotingEnabled} onClick={() => setGayatriVotingEnabled(!gayatriVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Ohmkara 528 Hz Oscillator</div>
                              <p className="text-[10px] text-indigo-500 m-0">Quantum frequency oscillator (NSE/BSE)</p>
                           </div>
                           <TogglePill enabled={ohmkaraVotingEnabled} onClick={() => setOhmkaraVotingEnabled(!ohmkaraVotingEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Lakshmi Win Probability Classifier</div>
                              <p className="text-[10px] text-indigo-500 m-0">Deep learning pattern classifier (NSE/BSE)</p>
                           </div>
                           <TogglePill enabled={lakshmiVotingEnabled} onClick={() => setLakshmiVotingEnabled(!lakshmiVotingEnabled)} />
                        </div>

                        {/* System Overrides */}
                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">AI Predictors Master Switch</div>
                              <p className="text-[10px] text-indigo-500 m-0">Run CNN/PPO/Mamba/Transformer/LSTM inference</p>
                           </div>
                           <TogglePill enabled={aiPredictorsEnabled} onClick={() => setAiPredictorsEnabled(!aiPredictorsEnabled)} />
                        </div>

                        <div className="d-flex justify-content-between align-items-center py-2 border-top border-indigo-100">
                           <div>
                              <div className="text-xs font-black text-dark uppercase tracking-tight">Transition Override</div>
                              <p className="text-[10px] text-indigo-500 m-0">Allow entries in TRANSITION regime on strong microstructure</p>
                           </div>
                           <TogglePill enabled={transitionOverrideEnabled} onClick={() => setTransitionOverrideEnabled(!transitionOverrideEnabled)} />
                        </div>
                     </div>

                     {/* Weather Effect on Market */}
                     <div className="bg-cyan-50 border border-cyan-200 p-4 rounded-financial mb-4">
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                           <div className="pe-3 flex-grow-1">
                              <div className="d-flex align-items-center gap-2 mb-1">
                                 <span className="text-sm font-black text-dark uppercase tracking-tight">🌦 Weather Effect on Market</span>
                                 <span className="text-[9px] font-bold text-cyan-700 uppercase tracking-widest bg-white px-2 py-0.5 rounded-pill border border-cyan-200">ALT-DATA</span>
                              </div>
                              <p className="text-xs text-secondary m-0">
                                 Adjusts risk sizing, leverage, regime and trade-quality scoring based on weather stress
                                 across global mining regions. When off, weather has zero market influence.
                              </p>
                           </div>
                           <div className="flex-shrink-0 ms-auto">
                              <TogglePill enabled={weatherEnabled} onClick={() => handleToggleWeather(!weatherEnabled)} />
                           </div>
                        </div>
                        {weatherEnabled && (
                           <div className="mt-3 pt-3 border-top border-cyan-200">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                 <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Influence Strength</span>
                                 <span className="text-xs font-black text-cyan-700 font-mono">{Math.round(weatherInfluence * 100)}%</span>
                              </div>
                              <input
                                 type="range" className="form-range" min={0} max={1} step={0.05}
                                 value={weatherInfluence}
                                 onChange={(e) => setWeatherInfluence(parseFloat(e.target.value))}
                                 onMouseUp={(e) => handleWeatherInfluence(parseFloat((e.target as HTMLInputElement).value))}
                                 onTouchEnd={(e) => handleWeatherInfluence(parseFloat((e.target as HTMLInputElement).value))}
                              />
                              <p className="text-[10px] text-secondary m-0">Scales how strongly weather stress moves risk multipliers (0% = none, 100% = full).</p>
                           </div>
                        )}
                     </div>

                     {modelsLoading ? (
                        <div className="d-flex align-items-center gap-2 text-secondary text-sm py-4">
                           <div className="spinner-border spinner-border-sm" role="status" /> Loading models…
                        </div>
                     ) : aiModels.length === 0 ? (
                        <div className="text-secondary text-sm py-4">No models registered.</div>
                     ) : (
                        <div className="space-y-3">
                           {aiModels.map((m) => (
                              <div key={m.id} className="d-flex justify-content-between align-items-center bg-white border border-financial p-4 rounded-financial">
                                 <div className="pe-3">
                                    <div className="d-flex align-items-center gap-2 mb-1">
                                       <span className="text-sm font-black text-dark uppercase tracking-tight">{m.name}</span>
                                       <span className="text-[9px] font-bold text-secondary uppercase tracking-widest bg-light px-2 py-0.5 rounded-pill border border-financial">{m.category}</span>
                                       {m.enabled && (
                                          <span className="text-[9px] font-bold text-primary uppercase tracking-widest">· wt {(m.weight * 100).toFixed(0)}%</span>
                                       )}
                                    </div>
                                    <p className="text-xs text-secondary m-0">{m.description}</p>
                                 </div>
                                 <TogglePill enabled={!!m.enabled} onClick={() => handleToggleModel(m.id, !m.enabled)} />
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               )}

               {tab === "SERVICES" && (
                  <div className="fade-in">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Server size={20} className="text-primary" />
                        <div>
                           <h4 className="text-dark font-bold tracking-tight m-0">Service Control</h4>
                           <p className="text-secondary text-xs m-0 mt-1">Start, stop or restart the backend services that power the trading engine.</p>
                        </div>
                        <button onClick={fetchServices} className="btn btn-link ms-auto p-0 text-secondary" title="Refresh">
                           <RefreshCw size={14} className={svcLoading ? "animate-spin" : ""} />
                        </button>
                     </div>

                     <div className="row g-4">
                        {/* Server */}
                        <div className="col-12 col-md-4">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(16,185,129,0.1)" }}>
                                       <Server size={18} className="text-success" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Server</div>
                                       <div className="text-[10px] text-secondary uppercase">Node / Express · :9991</div>
                                    </div>
                                 </div>
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="w-2 h-2 rounded-circle bg-success" />
                                    <span className="text-xs font-bold text-success uppercase">Online</span>
                                    {services?.server && (
                                       <span className="text-[10px] text-secondary ms-auto font-mono">
                                          up {Math.floor((services.server.uptime || 0) / 60)}m
                                       </span>
                                    )}
                                 </div>
                                 <div className="text-[10px] text-secondary mb-3">
                                    State: <span className="font-bold text-dark">{services?.server?.state ?? "—"}</span>
                                    {services?.server?.pid && <span className="ms-2">PID: {services.server.pid}</span>}
                                 </div>
                                 <button
                                    onClick={() => handleSvcAction("server_restart")}
                                    disabled={svcAction === "server_restart"}
                                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                                    style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                 >
                                    <RefreshCw size={12} className={svcAction === "server_restart" ? "animate-spin" : ""} />
                                    {svcAction === "server_restart" ? "Restarting..." : "Restart Server"}
                                 </button>
                                 <p className="text-[9px] text-secondary mt-2 mb-0 text-center">tsx / PM2 will auto-revive</p>
                              </div>
                           </div>
                        </div>

                        {/* Quant Engine */}
                        <div className="col-12 col-md-4">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(139,92,246,0.1)" }}>
                                       <Cpu size={18} className="text-purple-500" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Quant Engine</div>
                                       <div className="text-[10px] text-secondary uppercase">Python / FastAPI · dynamic port</div>
                                    </div>
                                 </div>
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className={`w-2 h-2 rounded-circle ${services?.quant?.status === "online" ? "bg-success" : "bg-danger"}`} />
                                    <span className={`text-xs font-bold uppercase ${services?.quant?.status === "online" ? "text-success" : "text-danger"}`}>
                                       {services?.quant?.status ?? "Checking..."}
                                    </span>
                                    {services?.quant?.url && (
                                       <span className="text-[10px] text-secondary ms-auto font-mono">{services.quant.url}</span>
                                    )}
                                 </div>
                                 {services?.quant?.health && (
                                    <div className="text-[10px] text-secondary mb-3">
                                       {Object.entries(services.quant.health).map(([k, v]: any) => (
                                          <span key={k} className="me-2">
                                             <span className={v === "HEALTHY" ? "text-success" : "text-danger"}>●</span> {k.toUpperCase()}
                                          </span>
                                       ))}
                                    </div>
                                 )}
                                 <div className="d-flex gap-2">
                                    {services?.quant?.status !== "online" ? (
                                       <button
                                          onClick={() => handleSvcAction("quant_start")}
                                          disabled={!!svcAction}
                                          className="btn btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                                          style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                       >
                                          <Play size={11} />
                                          {svcAction === "quant_start" ? "Starting..." : "Start"}
                                       </button>
                                    ) : (
                                       <button
                                          onClick={() => handleSvcAction("quant_stop")}
                                          disabled={!!svcAction}
                                          className="btn btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                                          style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                       >
                                          <Square size={11} />
                                          {svcAction === "quant_stop" ? "Stopping..." : "Stop"}
                                       </button>
                                    )}
                                    <button
                                       onClick={() => handleSvcAction("quant_restart")}
                                       disabled={!!svcAction}
                                       className="btn btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                                       style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                    >
                                       <RefreshCw size={11} className={svcAction === "quant_restart" ? "animate-spin" : ""} />
                                       {svcAction === "quant_restart" ? "Restarting..." : "Restart"}
                                    </button>
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* Client */}
                        <div className="col-12 col-md-4">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(6,182,212,0.1)" }}>
                                       <Monitor size={18} className="text-cyan-500" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Client</div>
                                       <div className="text-[10px] text-secondary uppercase">React / Vite · :9993</div>
                                    </div>
                                 </div>
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="w-2 h-2 rounded-circle bg-success animate-pulse" />
                                    <span className="text-xs font-bold text-success uppercase">Running</span>
                                    <span className="text-[10px] text-secondary ms-auto">(this app)</span>
                                 </div>
                                 <div className="text-[10px] text-secondary mb-3">
                                    You are currently viewing the client. Use Reload to apply config changes or clear UI state.
                                 </div>
                                 <button
                                    onClick={() => handleSvcAction("client_reload")}
                                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                                    style={{ background: "rgba(6,182,212,0.1)", color: "#0891b2", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                 >
                                    <RefreshCw size={12} />
                                    Reload App
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="mt-4 p-3 rounded-3 d-flex align-items-start gap-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <AlertTriangle size={14} className="text-warning mt-1 shrink-0" />
                        <p className="text-[11px] text-secondary m-0">
                           <strong className="text-dark">Restarting the server</strong> will briefly drop all WebSocket connections and halt the 60s trade tick. The trading engine auto-resumes within seconds once the server is back up. <strong className="text-dark">Stopping the Quant Engine</strong> puts AI models offline — the engine falls back to TA-only signals (Paper) or blocks entries (Live) per your fallback policy.
                        </p>
                     </div>
                  </div>
               )}

               {tab === "EXTERNAL_SYNC" && (
                  <div className="fade-in">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Globe size={20} className="text-primary" />
                        <div>
                           <h4 className="text-dark font-bold tracking-tight m-0">External Sync</h4>
                           <p className="text-secondary text-xs m-0 mt-1">Keep the node aligned with Binance and external services — clock, exchange rules and live account state.</p>
                        </div>
                        <button onClick={fetchExtStatus} className="btn btn-link ms-auto p-0 text-secondary" title="Refresh">
                           <RefreshCw size={14} className={extLoading ? "animate-spin" : ""} />
                        </button>
                     </div>

                     {extError && (
                        <div className="mb-4 p-3 rounded-3 d-flex align-items-center gap-2" style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)" }}>
                           <XCircle size={14} className="text-danger shrink-0" />
                           <span className="text-[11px] text-danger font-bold">{extError}</span>
                        </div>
                     )}

                     <div className="row g-4">
                        {/* Binance connectivity + time sync */}
                        <div className="col-12 col-md-6">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(245,158,11,0.1)" }}>
                                       <Globe size={18} className="text-warning" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Binance Time Sync</div>
                                       <div className="text-[10px] text-secondary uppercase">Signed requests need a synced clock</div>
                                    </div>
                                 </div>
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className={`w-2 h-2 rounded-circle ${extStatus?.binance?.ok ? "bg-success" : "bg-warning"}`} />
                                    <span className={`text-xs font-bold uppercase ${extStatus?.binance?.ok ? "text-success" : "text-warning"}`}>
                                       {extStatus ? (extStatus.binance?.ok ? "Reachable" : "REST Rate-Limited (WS Live)") : "Checking..."}
                                    </span>
                                    {extStatus?.binance && (
                                       <span className="text-[10px] text-secondary ms-auto font-mono">ping {extStatus.binance.latencyMs}ms</span>
                                    )}
                                 </div>
                                 <div className="text-[10px] text-secondary mb-3">
                                    Clock offset: <span className="font-bold text-dark font-mono">{extStatus?.timeSync?.offsetMs ?? "—"}ms</span>
                                    <span className="ms-2">Last sync: <span className="font-bold text-dark">{agoLabel(extStatus?.timeSync?.lastSyncedAt)}</span></span>
                                    <span className="ms-2 text-secondary">(auto every 15m)</span>
                                 </div>
                                 <button
                                    onClick={() => handleExtAction("time")}
                                    disabled={!!extAction}
                                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                                    style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                 >
                                    <RefreshCw size={12} className={extAction === "time" ? "animate-spin" : ""} />
                                    {extAction === "time" ? "Syncing..." : "Sync Time Now"}
                                 </button>
                              </div>
                           </div>
                        </div>

                        {/* Exchange info cache */}
                        <div className="col-12 col-md-6">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(139,92,246,0.1)" }}>
                                       <Database size={18} className="text-purple-500" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Exchange Rules</div>
                                       <div className="text-[10px] text-secondary uppercase">Symbols, lot sizes &amp; filters (12h cache)</div>
                                    </div>
                                 </div>
                                 <div className="text-[10px] text-secondary mb-1">
                                    Spot: <span className="font-bold text-dark font-mono">{extStatus?.exchangeInfo?.spot?.symbols ?? "—"}</span> symbols
                                    <span className="ms-2">fetched {agoLabel(extStatus?.exchangeInfo?.spot?.fetchedAt)}</span>
                                 </div>
                                 <div className="text-[10px] text-secondary mb-3">
                                    Futures: <span className="font-bold text-dark font-mono">{extStatus?.exchangeInfo?.futures?.symbols ?? "—"}</span> symbols
                                    <span className="ms-2">fetched {agoLabel(extStatus?.exchangeInfo?.futures?.fetchedAt)}</span>
                                 </div>
                                 <button
                                    onClick={() => handleExtAction("exchange_info")}
                                    disabled={!!extAction}
                                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                                    style={{ background: "rgba(139,92,246,0.1)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                                 >
                                    <RefreshCw size={12} className={extAction === "exchange_info" ? "animate-spin" : ""} />
                                    {extAction === "exchange_info" ? "Refreshing..." : "Force Refresh"}
                                 </button>
                              </div>
                           </div>
                        </div>

                        {/* Live account sync */}
                        <div className="col-12 col-md-6">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(16,185,129,0.1)" }}>
                                       <Key size={18} className="text-success" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Live Account</div>
                                       <div className="text-[10px] text-secondary uppercase">Pull balances straight from Binance</div>
                                    </div>
                                 </div>
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className={`w-2 h-2 rounded-circle ${extStatus?.apiKeysSaved ? "bg-success" : "bg-secondary"}`} />
                                    <span className={`text-xs font-bold uppercase ${extStatus?.apiKeysSaved ? "text-success" : "text-secondary"}`}>
                                       {extStatus ? (extStatus.apiKeysSaved ? "API keys saved" : "No API keys") : "Checking..."}
                                    </span>
                                 </div>
                                 {extAccount ? (
                                    <div className="text-[10px] text-secondary mb-3">
                                       <div className="mb-1">
                                          Spot: {extAccount.spot?.ok
                                             ? <span className="font-bold text-dark font-mono">{extAccount.spot.usdtFree?.toFixed(2)} USDT free · {extAccount.spot.assets} assets</span>
                                             : <span className="text-danger">{extAccount.spot?.error || "failed"}</span>}
                                       </div>
                                       <div>
                                          Futures: {extAccount.futures?.ok
                                             ? <span className="font-bold text-dark font-mono">{extAccount.futures.totalWalletBalance?.toFixed(2)} USDT wallet · {extAccount.futures.availableBalance?.toFixed(2)} avail</span>
                                             : <span className="text-danger">{extAccount.futures?.error || "failed"}</span>}
                                       </div>
                                       <div className="mt-1">Synced {agoLabel(extAccount.syncedAt)}</div>
                                    </div>
                                 ) : (
                                    <div className="text-[10px] text-secondary mb-3">
                                       {extStatus?.apiKeysSaved
                                          ? "Run a sync to verify your keys and see live balances."
                                          : "Save your Binance keys in the API_KEYS tab to enable live account sync."}
                                    </div>
                                 )}
                                 <button
                                    onClick={() => handleExtAction("account")}
                                    disabled={!!extAction || !extStatus?.apiKeysSaved}
                                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                                    style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, fontSize: 11, fontWeight: 700, opacity: extStatus?.apiKeysSaved ? 1 : 0.5 }}
                                 >
                                    <RefreshCw size={12} className={extAction === "account" ? "animate-spin" : ""} />
                                    {extAction === "account" ? "Syncing..." : "Sync Live Account"}
                                 </button>
                              </div>
                           </div>
                        </div>

                        {/* Service registry */}
                        <div className="col-12 col-md-6">
                           <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                              <div className="card-body p-4">
                                 <div className="d-flex align-items-center gap-2 mb-3">
                                    <div className="p-2 rounded-3" style={{ background: "rgba(6,182,212,0.1)" }}>
                                       <Activity size={18} className="text-cyan-500" />
                                    </div>
                                    <div>
                                       <div className="font-bold text-dark text-sm">Service Registry</div>
                                       <div className="text-[10px] text-secondary uppercase">External services registered with this node</div>
                                    </div>
                                    <span className="text-[10px] text-secondary ms-auto font-mono uppercase">{extStatus?.systemState ?? ""}</span>
                                 </div>
                                 {(extStatus?.services?.length ?? 0) === 0 && (
                                    <div className="text-[10px] text-secondary">No external services registered yet.</div>
                                 )}
                                 {(extStatus?.services ?? []).map((s: any) => {
                                    const stale = Date.now() - (s.lastHeartbeat || 0) > 60_000;
                                    return (
                                       <div key={s.name} className="d-flex align-items-center gap-2 mb-2">
                                          <div className={`w-2 h-2 rounded-circle ${stale ? "bg-danger" : "bg-success"}`} />
                                          <span className="text-xs font-bold text-dark">{s.name}</span>
                                          <span className="text-[10px] text-secondary font-mono">{s.url}</span>
                                          <span className="text-[10px] text-secondary ms-auto">beat {agoLabel(s.lastHeartbeat)}</span>
                                       </div>
                                    );
                                 })}
                                 <div className="text-[10px] text-secondary mt-3">
                                    MongoDB: <span className={`font-bold ${extStatus?.mongodb ? "text-success" : "text-danger"}`}>{extStatus ? (extStatus.mongodb ? "CONNECTED" : "OFFLINE") : "—"}</span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="mt-4 p-3 rounded-3 d-flex align-items-start gap-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <AlertTriangle size={14} className="text-warning mt-1 shrink-0" />
                        <p className="text-[11px] text-secondary m-0">
                           <strong className="text-dark">Clock drift</strong> beyond ~1000ms makes Binance reject signed requests (timestamp errors) — if live orders start failing, sync time first. The server re-syncs automatically every 15 minutes and exchange rules refresh every 12 hours; the buttons here only force it early.
                        </p>
                     </div>
                  </div>
               )}

               {tab === "INTERFACE" && (
                  <div className="fade-in max-w-2xl">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Layout size={20} className="text-primary" />
                        <h4 className="text-dark font-bold tracking-tight m-0">Display & Localization</h4>
                     </div>
                     <div className="row g-5 mt-2">
                        <div className="col-12 col-md-6">
                           <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-3 d-block">Currency Mode</label>
                           <div className="d-flex bg-light border border-financial rounded-financial p-1 shadow-inner">
                              {[
                                 { id: 'USDT_ONLY', label: 'USDT' },
                                 { id: 'USD_ONLY', label: 'USD' },
                                 { id: 'INR_ONLY', label: 'INR' },
                                 { id: 'USDT_INR', label: 'USDT + INR' }
                              ].map(m => (
                                 <button 
                                    key={m.id}
                                    onClick={() => setCurrencyMode(m.id as any)}
                                    className={clsx(
                                       "btn border-0 text-[10px] font-bold uppercase tracking-wider py-2.5 flex-grow-1 transition-all rounded-financial",
                                       currencyMode === m.id ? "bg-white text-primary shadow-sm" : "text-secondary hover:text-dark"
                                    )}
                                 >
                                    {m.label}
                                 </button>
                              ))}
                           </div>
                        </div>
                        <div className="col-12 col-md-6">
                           <label className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-3 d-block">Base Timeframe</label>
                           <select className="form-select form-select-lg border-financial text-dark text-sm font-bold shadow-none rounded-financial" value={defaultTf} onChange={e => setDefaultTf(e.target.value)}>
                              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                           </select>
                        </div>
                     </div>
                  </div>
               )}

               {tab === "WALLET" && (
                  <div className="fade-in max-w-2xl">
                     <div className="d-flex align-items-center gap-3 mb-4">
                        <Wallet size={20} className="text-primary" />
                        <h4 className="text-dark font-bold tracking-tight m-0">Wallet</h4>
                     </div>

                     <div className="p-4 border-2 border-indigo-200 rounded-financial" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}>
                        <span className="text-[11px] font-black text-indigo-700 uppercase tracking-widest d-block mb-1">Estimated Balance (Spot + Futures)</span>
                        <span className="text-2xl font-black text-dark font-mono d-block mb-1">
                           {walletLoading ? "…" : walletTotal ? `${walletTotal.usdt.toFixed(2)} USDT` : "—"}
                        </span>
                        {walletTotal && (
                           <span className="text-[11px] text-indigo-500 font-medium d-block mb-3">≈ ₹{walletTotal.inrEquivalent.toFixed(2)}</span>
                        )}
                        <p className="text-[11px] text-indigo-500 font-medium mb-3">
                           Deposit, Withdraw, Transfer, P2P, transaction history, and auto-trade controls all live on the full Wallet page now.
                        </p>
                        <button
                           onClick={() => navigate("/aqea/wallet")}
                           className="btn btn-primary border-0 d-flex align-items-center gap-2 px-4 py-3 rounded-financial font-bold text-[11px] uppercase tracking-widest shadow-sm"
                        >
                           Open Wallet <ArrowRight size={15} />
                        </button>
                     </div>
                  </div>
               )}

            </div>
         </div>
      </div>
    </div>
  );
}
