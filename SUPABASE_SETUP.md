# MYDAY cloud sync setup

The cloud-sync work stays on `feature/multi-user-myday`. The live GitHub Pages app is unchanged until backend deployment and integration tests pass.

## Supabase project

- Project ref: `rzgsctbvgzerqizfjhuq`
- Project URL: `https://rzgsctbvgzerqizfjhuq.supabase.co`
- Region: Frankfurt / Central EU

Keep the database password and all API secrets private.

## Deploy through GitHub Actions

A manual workflow is included at **Actions → Deploy MYDAY Supabase backend → Run workflow**. Before running it, add these repository Actions secrets in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token created in Supabase Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Database password chosen when the Supabase project was created |
| `TELEGRAM_BOT_TOKEN` | Token for the MYDAY bot from BotFather |

Enter each value directly into GitHub's secret form. Never commit them, put them in `backend-config.js`, or send them in chat.

The workflow:
1. Links the CLI to the MYDAY Supabase project.
2. Applies `supabase/migrations/001_myday_profiles.sql`.
3. Sets `TELEGRAM_BOT_TOKEN` as a server-side Edge Function secret. Supabase injects `SUPABASE_URL` and the project's server-side secret API key automatically.
4. Deploys `myday-sync`.

If the workflow fails, inspect the Actions run log. Secret values are not printed by the workflow.

## Database and security

The migration creates one private row per Telegram ID in `public.myday_profiles`. RLS is enabled, and direct table grants to `anon` and `authenticated` are revoked. The Edge Function reads the Supabase secret key from the injected `SUPABASE_SECRET_KEYS` (with a legacy service-role fallback) and uses it only in the `apikey` header for server-side REST calls.

The function's platform JWT check is intentionally disabled because the frontend uses a modern `sb_publishable_...` key, which is not a JWT. The frontend sends that key only in the `apikey` header. The function itself validates Telegram WebApp `initData` with the bot-token HMAC signature before reading or writing any profile. Do not remove that Telegram signature check.

## Frontend configuration

`backend-config.js` contains only public values:
- `supabaseUrl`: project URL.
- `supabaseAnonKey`: publishable key.
- `edgeFunctionName`: `myday-sync`.

Never put the bot token or service-role/secret key in frontend code.

## Telegram launch mode

Open MYDAY from the Telegram bot's Web App menu button so `Telegram.WebApp.initData` is available. A normal browser tab cannot authenticate the Telegram profile for cloud sync.

## Verification before publishing

1. Confirm the migration succeeded and RLS is enabled.
2. Confirm `myday-sync` is deployed and the bot-token secret is set.
3. Test load/save with one Telegram account.
4. Test isolation with a second Telegram account.
5. Test the same account on two devices.
6. Test offline edits and reconnect.
7. Verify legacy local-data import and export/restore.

Only after these checks should the feature branch be merged into `main` and GitHub Pages updated.
