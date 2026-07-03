# Dream Fly Global — DigitalOcean Deployment Guide

This guide covers deploying the app on a **DigitalOcean Ubuntu 22.04 Droplet** with a
**DigitalOcean Managed PostgreSQL** database.

---

## 1. Create a Droplet

- **Image**: Ubuntu 22.04 LTS
- **Size**: Basic — 2 vCPU / 4 GB RAM minimum (1 GB works for testing)
- **Region**: Same region as your Managed Database for low latency
- Add your SSH key during creation

---

## 2. Create a Managed PostgreSQL Database

1. DigitalOcean Console → **Databases** → **Create Database**
2. Choose **PostgreSQL 16**, same region as your Droplet
3. After creation, go to **Connection Details** → copy the **Connection String (URI)**

   It looks like:
   ```
   postgresql://doadmin:YOURPASSWORD@db-postgresql-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
   ```

4. Under **Trusted Sources**, add your Droplet's IP address so it can connect

---

## 3. Initial Server Setup

SSH into your Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

### Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v20.x.x
```

### Install pnpm

```bash
npm install -g pnpm
pnpm --version
```

### Install PM2

```bash
npm install -g pm2
pm2 --version
```

### Install Git

```bash
sudo apt-get install -y git
```

### Create log directory

```bash
sudo mkdir -p /var/log/dreamfly
sudo chown $USER:$USER /var/log/dreamfly
```

---

## 4. Deploy the Application

### Clone the repository

```bash
cd /var/www
git clone https://github.com/YOUR_USER/YOUR_REPO.git dreamflyglobal
cd dreamflyglobal
```

### Install dependencies

```bash
pnpm install --frozen-lockfile
```

---

## 5. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in all required values. At a minimum:

```env
DATABASE_URL=postgresql://doadmin:PASSWORD@db-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
PORT=3000
NODE_ENV=production
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_strong_password
```

Save and close (`Ctrl+X`, `Y`, `Enter`).

> **Security**: `.env` is git-ignored. It stays on your server only — never commit it.

---

## 6. Run Database Migrations

This is safe to run on every deploy. On first run it creates all 21 tables.
On subsequent runs it applies only new schema changes.

```bash
pnpm db:migrate
```

Expected output:
```
🔄  Dream Fly Global — Database Migration Runner
────────────────────────────────────────────────────
  🆕  Fresh database — all migrations will be applied.

▶   Running drizzle-orm migrate()…

✅  Migration complete — database is up to date.
```

---

## 7. Seed Default Data

Run once after migration to populate default settings, booking counters, and destinations:

```bash
pnpm db:seed
```

Expected output:
```
🚀  Dream Fly Global — PostgreSQL Seed Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦  Seeding booking_counters…
⚙️   Seeding app_settings namespaces…
🌍  Seeding destinations…
🔔  Seeding followup_settings…
✅  Seed complete. Database is ready.
```

---

## 8. Build the Application

```bash
pnpm build
```

This builds:
- **Frontend** → `artifacts/travel-booking/dist/public/`
- **API server** → `artifacts/api-server/dist/index.mjs`

---

## 9. Start with PM2

```bash
pm2 start ecosystem.config.cjs
```

Check it's running:

```bash
pm2 status
pm2 logs dreamfly-api --lines 50
```

### Enable auto-start on reboot

```bash
pm2 save
pm2 startup
# PM2 prints a command — copy and paste it, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
```

---

## 10. Set Up Nginx (Reverse Proxy)

```bash
sudo apt-get install -y nginx
```

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/dreamflyglobal
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase upload size for logo/favicon
    client_max_body_size 10M;

    # Uploaded files (logos, favicons)
    location /uploads/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend (served by Express from dist/public)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/dreamflyglobal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Add HTTPS with Certbot (free SSL)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 11. Subsequent Deploys

```bash
cd /var/www/dreamflyglobal
git pull
pnpm install --frozen-lockfile
pnpm db:migrate          # safe no-op if schema hasn't changed
pnpm build
pm2 reload ecosystem.config.cjs --update-env
```

---

## Useful Commands

| Command | Purpose |
|---|---|
| `pm2 status` | Show process list and uptime |
| `pm2 logs dreamfly-api` | Tail live logs |
| `pm2 logs dreamfly-api --lines 200` | Last 200 log lines |
| `pm2 restart dreamfly-api` | Hard restart |
| `pm2 reload dreamfly-api` | Zero-downtime reload |
| `pm2 monit` | Live CPU/memory dashboard |
| `pnpm db:migrate` | Apply new migrations |
| `pnpm db:seed` | Re-seed defaults (idempotent) |
| `pnpm build` | Rebuild frontend + API server |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`postgresql://...?sslmode=require`) |
| `PORT` | ✅ | Server port (default `3000`) |
| `NODE_ENV` | ✅ | Must be `production` |
| `JWT_SECRET` | ✅ | Random 64-byte hex string for JWT signing |
| `ADMIN_EMAIL` | ✅ | Admin login email for `/master-admin/login` |
| `ADMIN_PASSWORD` | ✅ | Admin login password |
| `LOG_LEVEL` | — | Pino log level: `info` (default), `debug`, `warn`, `error` |
| `TRIPJACK_API_KEY` | — | TripJack flights API key |
| `TRIPJACK_BASE_URL` | — | TripJack base URL (defaults to sandbox) |
| `HOTELBEDS_API_KEY` | — | HotelBeds hotel API key |
| `HOTELBEDS_SECRET` | — | HotelBeds secret |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID (WhatsApp marketing) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | — | Twilio WhatsApp sender number |
| `RAZORPAY_KEY_ID` | — | Razorpay key ID (payments) |
| `RAZORPAY_KEY_SECRET` | — | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | — | Razorpay webhook signature secret |

---

## Troubleshooting

### `DATABASE_URL is not set`
- Check `.env` exists at the project root: `cat .env | grep DATABASE_URL`
- Make sure there are no spaces around `=`: `DATABASE_URL=postgresql://...` ✅

### `connection refused` or SSL errors
- Verify your Droplet IP is in the database's **Trusted Sources**
- Confirm the URL ends with `?sslmode=require`

### Port 3000 already in use
- `pm2 delete dreamfly-api && pm2 start ecosystem.config.cjs`

### PM2 process keeps restarting
- Check error log: `pm2 logs dreamfly-api --err --lines 100`
- Most common cause: missing or wrong `DATABASE_URL`
