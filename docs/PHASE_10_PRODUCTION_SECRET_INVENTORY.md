# Phase 10 Production Secret Inventory

Names and purposes only. Never add values to this file.

## Vercel environment

| Name | Purpose |
|---|---|
| `APP_ENV` | Must be `production` |
| `APP_BASE_URL` | Canonical HTTPS origin |
| `SUPABASE_URL` | Production Data API origin |
| `SUPABASE_ANON_KEY` | Public Supabase Auth client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged database access |
| `SESSION_SIGNING_SECRET` | Owner session binding |
| `CRON_SHARED_SECRET` | Supabase Cron bearer authentication |
| `OWNER_EMAIL` | Exact owner allowlist |
| `EMAIL_TRANSPORT` | Must be `smtp` |
| `GMAIL_SMTP_USER` | Gmail sender identity |
| `GMAIL_SMTP_APP_PASSWORD` | Gmail app password, never the account password |
| `INTELLIGENCE_PROVIDER` | Must be `groq` for the approved beta |
| `GROQ_API_KEY` | Public-news generation only |
| `GROQ_GENERATION_MODEL` | Reviewed model identifier |
| `PROVIDER_*` | Local request/input ceilings |

## Supabase Vault

| Name | Purpose |
|---|---|
| `bulletin_app_base_url` | Vercel HTTPS origin only |
| `bulletin_cron_shared_secret` | Exact copy of Vercel `CRON_SHARED_SECRET` |

All cryptographic secrets must be independently generated and unequal except for the intentionally mirrored Cron bearer value. No sensitive variable may use a `NEXT_PUBLIC_` prefix.
