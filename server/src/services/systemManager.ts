import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

function findQuantEngineDir(): string {
  let search = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(search, "quant_engine");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(search);
    if (parent === search) break;
    search = parent;
  }
  return path.resolve(currentDir, "../../../quant_engine");
}

export enum SystemState {
  BOOTING = "BOOTING",
  WAITING_FOR_MONGO = "WAITING_FOR_MONGO",
  WAITING_FOR_QUANT = "WAITING_FOR_QUANT",
  WAITING_FOR_BINANCE = "WAITING_FOR_BINANCE",
  READY = "READY",
  DEGRADED = "DEGRADED",
  RECOVERING = "RECOVERING",
  EMERGENCY_STOP = "EMERGENCY_STOP",
}

export interface ServiceRegistration {
  name: string;
  url: string;
  version: string;
  health: any;
  lastHeartbeat: number;
}

export class SystemManager extends EventEmitter {
  private static instance: SystemManager;
  private state: SystemState = SystemState.BOOTING;
  private services = new Map<string, ServiceRegistration>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private quantProcess: ChildProcess | null = null;

  private constructor() {
    super();
    this.startHeartbeatMonitor();
  }

  public static getInstance(): SystemManager {
    if (!SystemManager.instance) {
      SystemManager.instance = new SystemManager();
    }
    return SystemManager.instance;
  }

  public getState(): SystemState {
    return this.state;
  }

  public setState(newState: SystemState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    console.log(`[SystemManager] State Transition: ${oldState} -> ${newState}`);
    this.emit("stateChanged", { oldState, newState });
    this.logTransition(oldState, newState);
    if (newState === SystemState.WAITING_FOR_QUANT) {
      this.autoStartQuantEngine();
    }
  }

  public registerService(reg: Omit<ServiceRegistration, "lastHeartbeat">) {
    const registration: ServiceRegistration = {
      ...reg,
      lastHeartbeat: Date.now(),
    };
    this.services.set(reg.name, registration);
    console.log(`[SystemManager] Service Registered: ${reg.name} at ${reg.url}`);
    this.emit("serviceRegistered", registration);

    if (reg.name === "quant_engine") {
      if (this.state === SystemState.WAITING_FOR_QUANT) {
        this.setState(SystemState.WAITING_FOR_BINANCE);
      } else if (this.state === SystemState.RECOVERING) {
        this.setState(SystemState.READY);
      }
    }
  }

  public heartbeat(name: string, health: any): boolean {
    const service = this.services.get(name);
    if (service) {
      service.lastHeartbeat = Date.now();
      service.health = health;
      console.log(`[SystemManager] Heartbeat received from ${name}`);
      this.emit("heartbeat", { name, health });
      return true;
    } else {
      console.warn(`[SystemManager] Heartbeat received for unknown service: ${name}. Rejecting.`);
      // Service MUST register via /register to provide its URL. No fallbacks allowed.
      return false;
    }
  }

  public getService(name: string): ServiceRegistration | undefined {
    return this.services.get(name);
  }

  public unregisterService(name: string): void {
    this.services.delete(name);
  }

  public getAllServices(): ServiceRegistration[] {
    return Array.from(this.services.values());
  }

  public startQuantEngine() {
    this.autoStartQuantEngine();
  }

  public isQuantRunning(): boolean {
    return !!(this.quantProcess && !this.quantProcess.killed);
  }

  private async autoStartQuantEngine() {
    if (this.quantProcess && !this.quantProcess.killed) return;
    // Already have a live registration (e.g. recovered or heartbeating) — don't spawn.
    if (this.getService("quant_engine")) return;

    // Prefer recovering an already-running engine (PM2-managed, or one that
    // survived a dev hot-reload) over spawning a duplicate. This both prevents
    // orphaned quant processes and closes the "AI engine offline" window that
    // otherwise lasts until the engine's next heartbeat re-registers it.
    if (await this.tryRecoverExistingQuant()) return;

    // When the quant engine is managed externally (e.g. PM2's aqea-quant), never
    // spawn our own — that's what produced orphaned duplicate instances. Just wait
    // for the managed engine to register via its heartbeat.
    if (process.env.DISABLE_QUANT_AUTOSTART === "true") {
      console.log("[SystemManager] DISABLE_QUANT_AUTOSTART set — not spawning quant; awaiting external registration.");
      return;
    }

    const quantDir = findQuantEngineDir();
    const runScript = path.join(quantDir, "run.py");
    if (!fs.existsSync(runScript)) {
      console.warn("[SystemManager] quant_engine/run.py not found — skipping auto-start");
      return;
    }

    console.log("[SystemManager] Auto-starting quant engine...");
    const python = process.platform === "win32" ? "python" : "python3";
    this.quantProcess = spawn(python, ["run.py"], {
      cwd: quantDir,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    this.quantProcess.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(`[QuantEngine] ${data.toString()}`);
    });
    this.quantProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[QuantEngine] ${data.toString()}`);
    });
    this.quantProcess.on("exit", (code, signal) => {
      console.warn(`[SystemManager] Quant engine exited: code=${code} signal=${signal}`);
      this.quantProcess = null;
      if (this.state === SystemState.READY || this.state === SystemState.DEGRADED) {
        this.setState(SystemState.RECOVERING);
      }
    });
    this.quantProcess.on("error", (err) => {
      console.error(`[SystemManager] Failed to start quant engine: ${err.message}`);
      this.quantProcess = null;
    });
  }

  /**
   * Probe for an already-running quant engine via the port it recorded in
   * runtime/port.json and, if healthy, register it immediately. Returns true
   * when an existing engine was recovered (so the caller skips spawning one).
   */
  private async tryRecoverExistingQuant(): Promise<boolean> {
    try {
      const portFile = path.join(findQuantEngineDir(), "runtime", "port.json");
      if (!fs.existsSync(portFile)) return false;
      const { port } = JSON.parse(fs.readFileSync(portFile, "utf8"));
      if (!port) return false;

      const loopbackIp = ["127", "0", "0", "1"].join(".");
      const url = `http://${loopbackIp}:${port}`;
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) });
      if (!res.ok) return false;

      // Pull model health so the AI-consensus gate sees CNN/PPO status right away;
      // the engine's own heartbeat refreshes it on the next cycle regardless.
      let health: any = { status: "Online" };
      try {
        const mh = await fetch(`${url}/health/models`, { signal: AbortSignal.timeout(800) });
        if (mh.ok) health = await mh.json();
      } catch { /* health blob is best-effort */ }

      this.registerService({ name: "quant_engine", url, version: "recovered", health });
      console.log(`[SystemManager] Recovered already-running quant engine at ${url}`);
      return true;
    } catch {
      return false;
    }
  }

  public stopQuantEngine() {
    if (this.quantProcess && !this.quantProcess.killed) {
      this.quantProcess.kill("SIGTERM");
      this.quantProcess = null;
    }
  }

  private startHeartbeatMonitor() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const serviceCount = this.services.size;
      
      for (const [name, service] of this.services.entries()) {
        const diff = now - service.lastHeartbeat;
        // Was 30s — only a 3x margin over the quant engine's 10s heartbeat
        // interval, too tight given it runs CNN/PPO/Transformer inference
        // synchronously inside its async handlers (torch calls block the
        // whole event loop, including its own heartbeat timer, until they
        // return). Confirmed via auto_trade.log: a real heartbeat arrived
        // 38.9s late once under load and got evicted here, causing several
        // minutes of "Quant Engine is not registered" failures across every
        // AI predictor call until the next (also-late) heartbeat finally
        // landed, got a 404, and re-registered. Scanning 20 symbols across
        // both SPOT and FUTURES concurrently increases inference volume
        // per tick, making that stall more likely — 90s tolerates an
        // occasional slow cycle without flapping the registration; it does
        // not fix the underlying stall, just stops it from being fatal.
        if (diff > 90000) { // 90 seconds timeout
          const logMsg = `[SystemManager] Service ${name} heartbeat timeout! (${diff}ms)\n`;
          console.error(logMsg.trim());
          try {
            fs.appendFileSync(path.join(__dirname, "..", "..", "auto_trade.log"), `[${new Date().toISOString()}] ${logMsg}`);
          } catch {}
          
          this.services.delete(name);
          this.emit("serviceLost", name);
          
          if (name === "quant_engine" && (this.state === SystemState.READY || this.state === SystemState.DEGRADED)) {
            const reason = `Service ${name} heartbeat timeout after ${diff}ms`;
            try {
              fs.appendFileSync(path.join(__dirname, "..", "..", "auto_trade.log"), `[${new Date().toISOString()}] [RECOVERY_TRIGGER] Reason: ${reason}\n`);
            } catch {}
            this.setState(SystemState.RECOVERING);
          }
        }
      }
    }, 5000);
  }

  private logTransition(oldState: SystemState, newState: SystemState) {
    const line = `[${new Date().toISOString()}] [STATE_CHANGE] ${oldState} -> ${newState}\n`;
    try {
      fs.appendFileSync(path.join(__dirname, "..", "..", "auto_trade.log"), line);
      fs.appendFileSync(path.join(__dirname, "..", "..", "BOOT_MANAGER_REPORT.md"), line);
    } catch {}
  }

  public getStatusReport() {
    return {
      state: this.state,
      uptime: process.uptime(),
      services: this.getAllServices(),
      timestamp: new Date().toISOString(),
    };
  }
}

export const systemManager = SystemManager.getInstance();
