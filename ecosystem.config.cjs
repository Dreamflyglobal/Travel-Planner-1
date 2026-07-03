/**
 * PM2 ecosystem config — DigitalOcean Droplet deployment
 *
 * ── Setup on a fresh DO Ubuntu droplet ───────────────────────────────────────
 *
 *   # 1. Install Node 20 + pnpm + PM2
 *   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
 *   sudo apt-get install -y nodejs
 *   npm install -g pnpm pm2
 *
 *   # 2. Clone repo and install deps
 *   git clone <your-repo> /var/www/dreamflyglobal
 *   cd /var/www/dreamflyglobal
 *   pnpm install --frozen-lockfile
 *
 *   # 3. Create your environment file
 *   cp .env.example .env
 *   nano .env          # fill in DATABASE_URL, JWT_SECRET, ADMIN_* etc.
 *   sudo mkdir -p /var/log/dreamfly
 *
 *   # 4. Run migrations + seed, then build
 *   pnpm db:migrate
 *   pnpm db:seed
 *   pnpm build
 *
 *   # 5. Start with PM2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup        # prints a command to run — copy & paste it for auto-restart on reboot
 *
 * ── Subsequent deploys ────────────────────────────────────────────────────────
 *   git pull
 *   pnpm install --frozen-lockfile
 *   pnpm db:migrate        # safe no-op if schema is up to date
 *   pnpm build
 *   pm2 reload ecosystem.config.cjs --update-env
 *
 * ── Logs ──────────────────────────────────────────────────────────────────────
 *   pm2 logs dreamfly-api
 *   pm2 monit
 */

module.exports = {
  apps: [
    {
      name: "dreamfly-api",

      // Built ESM bundle — no tsx/ts-node needed in production
      script: "artifacts/api-server/dist/index.mjs",
      interpreter: "node",

      // PM2 native .env file loading — no dotenv package required at root
      // PM2 reads this file and injects all KEY=VALUE pairs as env vars.
      env_file: ".env",

      // Merge static env on top of .env (these override .env if also set there)
      env: {
        NODE_ENV: "production",
      },

      // Instance config — set instances to "max" on multi-core droplets
      instances: 1,
      exec_mode: "fork",

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      restart_delay: 3000,

      // Logging — ensure /var/log/dreamfly exists before starting
      out_file: "/var/log/dreamfly/out.log",
      error_file: "/var/log/dreamfly/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
