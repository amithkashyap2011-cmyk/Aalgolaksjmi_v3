// PM2 process manifest — the ONE supported way to run AALGOLAKSHMI.
//
//   pm2 start ecosystem.config.js     # start both tiers (single instances)
//   npm run deploy                    # after editing code: build server + client, restart both
//   pm2 restart aqea-server           # restart only (does NOT rebuild — run `npm run build:server` first)
//   pm2 logs / pm2 status / pm2 stop all
//
// Do NOT also run `npm run dev` — PM2 keeps exactly one server + one quant engine
// alive. Running a second copy is what previously caused duplicate engines, a
// flapping quant registration, and spurious "AI engine offline" blocks.
module.exports = {
  apps: [
    {
      name: 'aqea-server',
      // Runs the COMPILED server (server/dist, built by `npm run build:server`) with plain
      // Node: no runtime TypeScript transpile (saves ~100 MB of resident memory on this
      // 8 GB machine and cuts restart time). PM2 owns restarts, so there is always
      // exactly one instance. After changing server code you must rebuild first.
      script: 'dist/index.js',
      cwd: './server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      kill_timeout: 5000,          // give the 60s engine loop time to drain on stop
      restart_delay: 3000,
      max_restarts: 10,
      // Safety net against a runaway/leaking process taking down the host —
      // observed steady-state usage is a few tens of MB; this is generous
      // headroom, not a tight budget.
      max_memory_restart: '1G',
      env: {
        // 'development', not 'production': this box serves plain HTTP on
        // loopback with no TLS termination and no trusted reverse proxy in
        // front of it. middleware/transportSecurity.ts fails closed and
        // refuses to boot under NODE_ENV=production unless SSL_CERT_PATH/
        // SSL_KEY_PATH or TRUST_PROXY=true are set — setting either without
        // an actual proxy/certs would just be lying to that check, not
        // satisfying it. If this ever runs behind a real TLS-terminating
        // proxy, set NODE_ENV=production and TRUST_PROXY=true together.
        NODE_ENV: 'development',
        PORT: 9991,
        // Native bcrypt (auth) and outbound Binance DNS lookups all run on the
        // libuv threadpool. At the default size of 4, stalled Binance DNS/fetch
        // calls occupy every thread and starve bcrypt.compare, so /auth/login
        // never resolves and the client renders "Offline". Give them headroom.
        UV_THREADPOOL_SIZE: '64',
        // The quant engine is managed by PM2 (aqea-quant) below — the server must
        // never spawn its own copy, or duplicate instances pile up.
        DISABLE_QUANT_AUTOSTART: 'true'
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true
    },
    {
      name: 'aqea-quant',
      script: 'run.py',
      cwd: './quant_engine',
      interpreter: '/opt/homebrew/bin/python3.12',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      kill_timeout: 5000,
      restart_delay: 5000,
      max_restarts: 10,
      // Higher ceiling than the Node server — this process holds several
      // loaded ML models (CNN/PPO/Mamba/Transformer) in memory at once.
      max_memory_restart: '2G',
      env: {
        // How the quant engine finds the Node server to register with.
        REGISTRY_URL: 'http://127.0.0.1:9991',
        OMP_NUM_THREADS: '1',
        MKL_NUM_THREADS: '1',
        OPENBLAS_NUM_THREADS: '1',
        VECLIB_MAXIMUM_THREADS: '1',
        NUMEXPR_NUM_THREADS: '1',
        TORCH_NUM_THREADS: '1',
        AQEA_CONTINUOUS_LEARNING: 'false'
      },
      error_file: './logs/quant-error.log',
      out_file: './logs/quant-out.log',
      merge_logs: true
    },
    {
      name: 'aqea-client',
      // Production client: serves client/dist (built by `npm run build:client`) with
      // `vite preview` on port 9994 — same port and the same /auth, /trading, /aqea-ui,
      // /socket.io ... proxy to the server on :9991 as the dev server (vite.config).
      // No HMR/file watching, so it is far lighter than `vite` dev.
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 9994 --strictPort',
      cwd: './client',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: '512M',
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true
    },
    {
      // Fixed-IP egress for Binance API-key requests (see scripts/binance_tunnel.sh
      // and BINANCE_HTTP_PROXY in server/.env). An ssh tunnel to a small proxy on a
      // cloud VM with a stable public IP; idles until BINANCE_TUNNEL_HOST is set.
      // Exits if the link drops (ServerAlive*), so PM2 restarts it with backoff.
      name: 'binance-tunnel',
      script: 'scripts/binance_tunnel.sh',
      interpreter: 'bash',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      min_uptime: '10s',
      max_restarts: 100000,
      error_file: './logs/binance-tunnel-error.log',
      out_file: './logs/binance-tunnel-out.log',
      merge_logs: true
    },
    {
      // Public-IP stability monitor (scripts/ip_watch.mjs): one tiny request a minute,
      // logs only CHANGES to logs/ip-watch.log. Binance keys are IP-whitelisted, so
      // "how often does this network's IP change?" decides whether a whitelist can work.
      // Report:  node scripts/ip_watch.mjs --summary
      name: 'ip-watch',
      script: 'scripts/ip_watch.mjs',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '100M',
      error_file: './logs/ip-watch-error.log',
      out_file: './logs/ip-watch-out.log',
      merge_logs: true
    },
    {
      // External soak-test monitor (scripts/soak_test.mjs) — deliberately
      // its own PM2 process, not code inside aqea-server, so it keeps
      // recording (including counting aqea-server's own restarts) even
      // when the server it's watching restarts or crashes. Polls /health
      // and /metrics every 30s, logs to soak_logs/, writes hourly rollups.
      name: 'soak-monitor',
      script: 'scripts/soak_test.mjs',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '256M',
      error_file: './logs/soak-monitor-error.log',
      out_file: './logs/soak-monitor-out.log',
      merge_logs: true
    },
    {
      // Sleep Mode Guardian (scripts/sleep_mode_agent.mjs)
      // 1. Asserts macOS caffeinate keep-alive assertion to prevent system/display sleep
      // 2. Continuous multi-tier health watchdog & automated recovery
      // 3. Overnight autonomous trading supervisor and telemetry recorder
      name: 'aqea-sleep-guardian',
      script: 'scripts/sleep_mode_agent.mjs',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '256M',
      error_file: './logs/sleep-mode-error.log',
      out_file: './logs/sleep-mode-out.log',
      merge_logs: true
    }
  ]
};
