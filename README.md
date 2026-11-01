# Money Tracker

Personal finance PWA. The full spec is in [SPEC.md](SPEC.md).

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, the publishable key and `ALLOWED_EMAIL`.
3. Apply the database migrations in `supabase/migrations/` (in filename order). Either:
   - run `supabase link --project-ref <ref>`, then `supabase db push`, or
   - paste each file into the Supabase SQL editor.
4. `npm run dev`, then open http://localhost:3000.

## Supabase auth settings

- **Auth → URL Configuration**: Site URL = your Vercel URL. Add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**` to Redirect URLs.
- **Auth → Email Templates → Magic Link**: include `{{ .Token }}` in the body. The installed iPhone app can't receive the link's session, so you sign in there by typing the code.
- After your first sign-in, turn off **Allow new users to sign up** (Auth → Providers / Sign In settings).

## Deploy (Vercel Hobby)

Import the repo in Vercel, then add the same environment variables as `.env.local`, plus `CRON_SECRET` (any long random string).
`vercel.json` runs `/api/cron/keepalive` once a day so the free Supabase project never pauses.
