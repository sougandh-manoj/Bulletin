# Phase 10 Provider and Platform Verification

Verified from official sources on 19 July 2026. Limits remain unstable and must be checked in the actual account before enablement.

| Provider | Verified finding | Production decision |
|---|---|---|
| Vercel | Hobby provides one million included function invocations; current Fluid Node functions support up to 300 seconds. Hobby's own Cron remains unsuitable for minute scheduling | Use Hobby for stateless Next.js functions, invoked externally by Supabase Cron. Five jobs estimate 181,440 scheduled invocations per 30 days before site traffic. [Hobby plan](https://vercel.com/docs/plans/hobby), [function limits](https://vercel.com/docs/functions/limitations) |
| Supabase | Free: 500 MB database and two projects; Cron uses `pg_cron`, can make HTTP requests, and recommends no more than eight concurrent jobs and ten minutes/job | Use Free PostgreSQL, Vault, `pg_net`, and five Cron jobs. Monitor size/activity. The owner accepts possible data loss during the personal beta and has deferred independent backup. [Pricing](https://supabase.com/pricing), [Cron](https://supabase.com/docs/guides/cron), [scheduled HTTP](https://supabase.com/docs/guides/functions/schedule-functions) |
| Render | Free services sleep and paid services create recurring cost | Rejected for this beta. The blueprint was removed; Docker remains a local/future self-hosted fallback only. [Free limitations](https://render.com/docs/free) |
| Groq | `openai/gpt-oss-20b` is production-listed; free published limit 30 RPM/1,000 RPD/8K TPM/200K TPD; developer price US$0.075/M input and US$0.30/M output | Keep current lower ceilings: 25/900/5,500/160,000. Confirm account page and enable ZDR before production. [Models/pricing](https://console.groq.com/docs/models), [rate limits](https://console.groq.com/docs/rate-limits), [data handling](https://console.groq.com/docs/your-data) |
| Gmail | Personal Gmail publishes 500 messages/day; TLS and sender-authentication guidance apply; app-specific password may be required | Owner → 5 → 20 → 50–100 warm-up only; observe SMTP responses and never retry ambiguous acceptance. [Sending limits](https://support.google.com/mail/answer/22839), [sender guidelines](https://support.google.com/mail/answer/81126) |
| Next.js | Bundled 16.2.10 guidance requires server-only secrets, production build checks, CSP consideration, and a supported Node runtime | Vercel project uses Node 22 and server-only configuration. Local Node 20 warnings are not production evidence. |

## Publisher term checkpoint

- Science X/Phys.org feeds currently permit personal and commercial RSS use with unchanged headline/link and credit; Bulletin preserves attribution/direct links but rewrites shared headlines, so counsel/permission should confirm whether that use remains within the feed license.
- India Today’s RSS page permits personal use and restricts commercial use/retained copies. Current non-commercial private-beta compatibility remains interpretive, not certain.
- NDTV’s RSS-specific terms expressly offer headlines to individuals for personal, non-commercial use, describe polling by RSS readers, and require `NDTV.com` attribution. Its general service terms separately restrict automated access and selection. On 19 July 2026 the owner approved using the official feeds for Bulletin’s personal, non-commercial private beta with `NDTV.com` beside every direct original-article link. This is a bounded owner risk decision, not a finding that the documents are unambiguous or legal advice; re-review or permission is required before any public or commercial launch.
- Institutional and Creative Commons sources still require their individual attribution/license conditions.

No “approved” catalogue flag is legal advice. The external beta remains closed until all remaining launch checkpoints are resolved.
