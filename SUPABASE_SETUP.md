# MYDAY cloud sync setup

This branch is intentionally not published to GitHub Pages yet. The live app remains unchanged until the backend is configured and tested.

## 1. Create a Supabase project

Create a project in the Supabase dashboard. Keep the database password private.

## 2. Create the profile table

Run the SQL in `supabase/migrations/001_myday_profiles.sql` in the Supabase SQL Editor.

The table has one row per Telegram ID. RLS is enabled and direct browser access is revoked. The Edge Function uses the server-only service-role key after validating Telegram's signed `initData`.

## 3. Deploy the Edge Function

Deploy `supabase/functions/myday-sync/index.ts` as a function named `myday-sync`.

Set these Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets:

- `TELEGRAM_BOT_TOKEN`: token from BotFather. Never paste this into ChatGPT, GitHub, or frontend files.
- `SUPABASE_URL`: project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key. Keep it server-side only.

Do not disable JWT verification as a shortcut. The function additionally verifies Telegram WebApp initData on every request.

## 4. Configure the public frontend

Edit `backend-config.js` and set only:
- `supabaseUrl`: Supabase project URL.
- `supabaseAnonKey`: Supabase anon/public key.
- Keep `edgeFunctionName` as `myday-sync`.

The anon key is designed for browser use. The bot token and service-role key must never be placed here.

## 5. Telegram launch mode

The app must be opened from the bot's Telegram Web App menu button so `Telegram.WebApp.initData` is present. A plain external browser tab cannot authenticate a Telegram profile for cloud sync.

## 6. Safe migration and verification

On first launch with a Telegram account, MYDAY checks the cloud profile. If none exists and old local data is present, it asks whether to import it. The original local copy is retained.

Before publishing this branch:
1. Test load/save with two different Telegram accounts.
2. Confirm one account cannot read another account's profile.
3. Test the same account on two devices.
4. Test offline edits and reconnect/sync.
5. Verify the old local data migration and export/restore.

Only after these checks should the feature branch be merged into `main` and GitHub Pages updated.
