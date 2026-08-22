# Docker Deployment Guide

This guide explains how to install, configure, back up, restore and troubleshoot Smart Landlord with Docker Compose.

The stack has two services:

- `db`: PostgreSQL 16 with a persistent named volume
- `app`: Node.js API plus built React/PWA interface

## 1. Install Docker

Install Docker Engine or Docker Desktop and confirm Compose v2:

```bash
docker --version
docker compose version
```

If `docker compose` fails but `docker-compose` works, upgrade to modern Compose v2 or create an alias. The commands below assume `docker compose`.

## 2. Get the application

Clone the repository:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/smart-landlord.git
cd smart-landlord
```

Or download the repository ZIP from GitHub, extract it, rename the extracted folder to `smart-landlord`, then enter it.

## 3. Configure secrets and settings

The easiest way is:

```bash
bash scripts/setup.sh
```

Manual configuration:

```bash
mkdir -p secrets
chmod 700 secrets
openssl rand -hex 24 > secrets/db_password.txt
openssl rand -hex 32 > secrets/jwt_secret.txt
chmod 600 secrets/*.txt
cp .env.example .env
nano .env
```

Available values:

| Variable | Meaning | Recommended |
|---|---|---|
| `ADMIN_EMAIL` | First admin email | Your real email |
| `ADMIN_PASSWORD` | First admin password | Long unique password |
| `SEED_DEMO` | Load example properties/data | `false` for real use |
| `APP_PORT` | Host port for the web app | `8080` or free port |

Do not commit `.env` or `secrets/`.

## 4. Start the stack

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Expected result:

```text
smart-landlord-db-1   running healthy
smart-landlord-app-1  running healthy
```

Open:

```text
http://localhost:8080
```

If Docker is on another machine, replace `localhost` with its IP.

First sign-in values are stored in `.env`. Change the password immediately from **Settings**.

## 5. View logs

Application logs:

```bash
docker compose logs -f app
```

Database logs:

```bash
docker compose logs -f db
```

Last 100 lines only:

```bash
docker compose logs --tail=100 app
```

## 6. Stop and restart

Stop without deleting data:

```bash
docker compose stop
```

Start again:

```bash
docker compose start
```

Recreate containers after changing `docker-compose.yml` or `.env`:

```bash
docker compose up -d --force-recreate
```

## 7. Update the application

```bash
git pull
docker compose up -d --build
docker image prune -f
```

Normal updates preserve these named volumes:

- `smart-landlord_postgres-data`
- `smart-landlord_app-uploads`

Always take a backup first.

## 8. Back up

Create a backup folder:

```bash
mkdir -p backups
```

Back up the PostgreSQL database:

```bash
docker compose exec -T db pg_dump -U landlord smart_landlord | gzip > "backups/db-$(date +%F-%H%M).sql.gz"
```

Back up uploaded documents:

```bash
docker run --rm \
  -v smart-landlord_app-uploads:/data:ro \
  -v "$PWD/backups":/backup \
  alpine tar czf "/backup/uploads-$(date +%F-%H%M).tar.gz" -C /data .
```

Copy both files somewhere off the server.

## 9. Restore

Restore a database backup:

```bash
gunzip -c backups/db-2026-08-22-1200.sql.gz | \
  docker compose exec -T db psql -U landlord smart_landlord
```

Restore uploaded documents:

```bash
docker run --rm \
  -v smart-landlord_app-uploads:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c "cd /data && tar xzf /backup/uploads-2026-08-22-1200.tar.gz"
```

Restart afterward:

```bash
docker compose restart
```

## 10. Reverse proxy and HTTPS

For LAN-only use, plain HTTP may be acceptable. For internet exposure, use HTTPS.

Common options:

- Nginx Proxy Manager
- Caddy
- Traefik
- Cloudflare Tunnel
- Tailscale or WireGuard for private remote access

Proxy traffic to the internal app port:

```text
app:8080
```

If the proxy terminates HTTPS, preserve the `X-Forwarded-Proto https` header. The app already sets secure cookies when the original request is HTTPS.

## NAS and Synology notes

These are ordinary Docker steps applied through DSM.

### Using SSH

1. Install Container Manager from Package Center.
2. Enable SSH temporarily in DSM.
3. Connect:

```bash
ssh your-synology-user@your-nas-ip
```

4. Put the project in the Docker shared folder:

```bash
mkdir -p /volume1/docker/smart-landlord
cd /volume1/docker/smart-landlord
git clone https://github.com/YOUR_GITHUB_USERNAME/smart-landlord.git .
sudo bash scripts/setup.sh
```

If your volume is not `volume1`, use the correct path.

5. Open:

```text
http://your-nas-ip:8080
```

On many Synology accounts, Docker requires `sudo`.

### Using Container Manager

1. Copy or clone the project into `/volume1/docker/smart-landlord`.
2. Open Container Manager.
3. Go to **Project**.
4. Choose **Create**.
5. Select the project folder and use the existing `docker-compose.yml`.
6. Build and start the project.

After creation, Container Manager can stop/start/rebuild the stack.

### NAS permissions

If files were copied as root or by another user, fix ownership before building:

```bash
sudo chown -R your-synology-user:users /volume1/docker/smart-landlord
```

Then rerun setup.

## Troubleshooting

### Containers keep restarting

Check logs:

```bash
docker compose logs app
docker compose logs db
```

Database connection errors usually mean the database was not healthy yet. Wait and check:

```bash
docker compose ps
```

Then restart the app:

```bash
docker compose restart app
```

### Cannot connect to port

Confirm the mapped port:

```bash
docker compose ps
```

Change it in `.env`:

```env
APP_PORT=8090
```

Then recreate:

```bash
docker compose up -d --force-recreate
```

Check local firewall rules if the page loads on the server but not from another device.

### Secrets error

Docker Compose needs both secret files:

```bash
ls -l secrets/db_password.txt secrets/jwt_secret.txt
```

If missing, regenerate them:

```bash
openssl rand -hex 24 > secrets/db_password.txt
openssl rand -hex 32 > secrets/jwt_secret.txt
chmod 600 secrets/*.txt
docker compose up -d
```

Never change the database password file after the PostgreSQL volume has initialized unless you also update the password inside PostgreSQL.

### Reset forgotten admin password

From the project folder:

```bash
HASH=$(docker compose exec -T app node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" 'YourNewPassword123')
docker compose exec -T db psql -U landlord -d smart_landlord -c "UPDATE users SET password_hash='$HASH' WHERE email='admin@example.com';"
```

### Clean rebuild without deleting data

```bash
docker compose down
docker compose build --no-cache app
docker compose up -d
```

### Full destructive reset

Warning: deletes all records, uploads, volumes and secrets.

```bash
docker compose down -v
rm -f .env secrets/*.txt
bash scripts/setup.sh
```
