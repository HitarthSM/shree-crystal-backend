# Security Launch Checklist

All critical security items have been verified on the running application and raw database layer.

- [x] **1. Throttler Limits Verified**: Confirmed throttler limits are applied to authentication endpoints (`/api/auth/login`). Sending 15 rapid requests returned a standard `429 Too Many Requests` response. (Date: 2026-08-13)
- [x] **2. Helmet Headers Present**: Confirmed via `curl -I` that Helmet security headers (e.g., `Content-Security-Policy`, `X-XSS-Protection`, `Strict-Transport-Security`, `X-Frame-Options`) are present on API responses. (Date: 2026-08-13)
- [x] **3. CORS Configuration Verified**: Confirmed that the application rejects arbitrary origins. An OPTIONS pre-flight request with `Origin: http://evil.com` correctly denied the origin. (Date: 2026-08-13)
- [x] **4. Encryption at Rest (Aadhaar/PAN)**: Confirmed by inspecting raw database values via `psql`. The `members` table correctly stores encrypted buffers/strings and hashed identifiers, without exposing plaintext Aadhaar or PAN. (Date: 2026-08-13)
- [x] **5. Masked Values in API**: Confirmed that the Member Profile endpoints (e.g., `GET /api/members`) return `"MASKED"` or `null` for `aadhaarEncrypted` and `panEncrypted` fields instead of returning decrypted sensitive data. (Date: 2026-08-13)
- [x] **6. Dependency Audit**: Ran `npm audit` and resolved high-severity vulnerabilities where possible (updated Prisma and core dependencies). (Date: 2026-08-13)
- [x] **7. `.env` Git History Check**: Confirmed that `.env` is listed in `.gitignore` and has never been committed to the repository history. (Date: 2026-08-13)
- [x] **8. AuditLogInterceptor Coverage**: Fixed a bug where logs were only sent to the console and not the DB. Verified that mutating requests (e.g. `PATCH /api/members/:id/status`) automatically persist a rich audit entry with `actorId` and `action` in the `activity_logs` table. (Date: 2026-08-13)
