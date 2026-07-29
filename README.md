# Bulletin

Bulletin is a personalized email news briefing product. Subscribers choose their interests, location, language, theme, and delivery schedule, then receive a concise briefing instead of an endless news feed.

## What It Does

- Collects subscriber briefing preferences through a Next.js onboarding flow.
- Ingests RSS/Atom news sources into Supabase.
- Groups related stories and prepares verified shared summaries.
- Personalizes story selection by category, location, language, and schedule.
- Sends styled email briefings with secure manage/delete access.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Supabase
- Vitest
- Tailwind CSS

## Getting Started

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

Open `http://localhost:3000`.

For database-backed local work, start Supabase first:

```bash
npm run db:start
npm run db:reset
```

## Useful Commands

```bash
npm run dev        # start local web app
npm run lint       # run ESLint
npm run typecheck  # run TypeScript checks
npm run test       # run unit tests
npm run build      # create production build
npm run check      # run main verification checks
```

## Project Structure

```text
apps/web/     Next.js application
supabase/     Database migrations, seed data, and tests
docs/         Architecture notes and launch runbooks
tools/        Utility scripts
```

## Environment

Use `apps/web/.env.example` as the template for local configuration. Keep real API keys, SMTP credentials, Supabase service-role keys, subscriber data, and private links out of git.

## Status

This repository is an active product build for Bulletin, including the web app, ingestion pipeline, intelligence layer, delivery workflow, and production readiness checks.
