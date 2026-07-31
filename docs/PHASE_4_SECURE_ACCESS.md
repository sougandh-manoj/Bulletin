# Phase 4 Secure Access

The original Phase 4 subscriber verification links and custom subscriber
sessions have been retired by the Phase 11 social-auth migration.

Subscriber access now uses Supabase Auth:

- Google OAuth is the enabled launch provider.
- Apple remains visible as a disabled `Coming soon` option.
- `/auth/callback` exchanges the provider code for a Supabase Auth session.
- Authenticated subscribers are resolved by `auth_user_id`, with one-time
  email linking for existing active or paused subscribers.
- Subscriber preferences, schedules, delivery history, and deletion remain
  server-only.

Owner dashboard access is separate and intentionally continues to use the
existing signed owner-access flow and `SESSION_SIGNING_SECRET`.

The cleanup migration removes abandoned pending subscribers, legacy
verification/session tables, related database functions, and obsolete
subscriber token columns. It preserves active and paused subscribers and all
current briefing data.
