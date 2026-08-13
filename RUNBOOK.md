# 📖 System Operations & Deployment Runbook

This document outlines standard operating procedures for deployment, monitoring, and emergency recovery of the Shree Crystal Credit Society Backend.

## 🔒 1. HTTPS Enforcement

All traffic to the API must be encrypted in transit.

*   **Responsibility**: HTTPS must be enforced at the infrastructure/proxy level.
*   **Implementation Methods**:
    *   **PaaS Providers (Render, Railway, etc.)**: These platforms typically provision Let's Encrypt certificates automatically and enforce HTTPS by default. Ensure that any "Force HTTPS" setting in your provider's dashboard is enabled.
    *   **VPS/Bare Metal (Nginx)**: If deploying on a raw server, set up an Nginx reverse proxy in front of the Node.js application. Use `certbot` (Let's Encrypt) to generate SSL certificates and configure Nginx to redirect all port 80 traffic to 443.

## 🏥 2. Uptime Monitoring

To ensure the system is available and the database is reachable, configure your external uptime monitor (e.g., UptimeRobot, Pingdom, BetterStack, or your PaaS provider's health checks).

*   **Endpoint**: `GET /health`
*   **Expected Status**: HTTP `200 OK`
*   **Behavior**: This endpoint explicitly verifies both the application's readiness and connectivity to the PostgreSQL database. If the database is unreachable, the endpoint will return an HTTP `503 Service Unavailable`.

## 🔄 3. Rollback Process

In the event of a critical failure following a deployment, execute the following rollback steps. **Do this quickly rather than attempting to debug on production.**

### Step 3.1: Redeploy the Previous Application Version

**If using an automated platform (Render, Railway, Vercel):**
1. Navigate to your project dashboard's Deployments/Builds section.
2. Identify the last known successful deployment.
3. Click "Redeploy" or "Rollback to this build."

**If deploying manually (Git/SSH):**
1. SSH into the production server.
2. Navigate to the app directory: `cd /var/www/prod`
3. Fetch branches and find the previous working commit: `git log --oneline`
4. Reset hard to that commit: `git reset --hard <previous-commit-hash>`
5. Rebuild and restart the app:
   ```bash
   npm ci
   npm run build
   pm2 restart prod-app
   ```

### Step 3.2: Restore the Database (If Needed)

If the bad deployment involved a destructive database migration or data corruption, you must restore the database to the pre-deployment state.

> [!CAUTION]
> Restoring a backup will overwrite all current data. Any transactions that occurred after the backup was taken will be lost.

1. **Locate Backup**: Retrieve the latest automated PostgreSQL backup (e.g., from AWS S3, local cron backups, or your managed database provider's point-in-time recovery UI).
2. **Stop the Application**: Prevent new connections during restore.
   ```bash
   pm2 stop prod-app
   ```
3. **Drop and Recreate Database**:
   ```bash
   dropdb -U postgres shree_crystal_prod_db
   createdb -U postgres shree_crystal_prod_db
   ```
4. **Restore Data**:
   ```bash
   pg_restore -U postgres -d shree_crystal_prod_db -1 /path/to/backup.dump
   ```
5. **Restart Application**:
   ```bash
   pm2 start prod-app
   ```
6. **Verify**: Check the `/health` endpoint to ensure the application is successfully reconnected to the restored database.
