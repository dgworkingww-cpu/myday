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
3. Sets `TELEGRAM_BOT_TOKEN` as a server-side Edge Function secret. Supabase injects `SUPABASE_URL` and its server-side secret API key automatically.
4. Deploys `myday-sync` with JWT verification enabled.

If the workflow fails, inspect the Actions run log. Secret values are not printed by the workflow.

## Database and security

The migration creates one private row per Telegram ID in `public.myday_profiles`. RLS is enabled, and direct table grants to `anon` and `authenticated` are revoked. The Edge Function uses the service-role key only server-side, after validating Telegram WebApp `initData` with the bot token.

Do not disable Edge Function JWT verification. The frontend sends the Supabase publishable key as the gateway bearer token; the function additionally validates Telegram's signed `initData`.

## Frontend configuration

`backend-config.js` contains only public values:
- `supabaseUrl`: project URL.
- `supabaseAnonKey`: publishable key.
- `edgeFunctionName`: `myday-sync`.

Never put the bot token or service-role key in frontend code.

## Telegram launch mode

Open MYDAY from the Telegram bot's Web App menu button so `Telegram.WebApp.initData` is available. A normal browser tab cannot authenticate the Telegram profile for cloud sync.

## Verification before publishing

1. Confirm the migration succeeded and RLS is enabled.
2. Confirm `myday-sync` is deployed and its secrets are set.
3. Test load/save with one Telegram account.
4. Test isolation with a second Telegram account.
5. Test the same account on two devices.
6. Test offline edits and reconnect.
7. Verify legacy local-data import and export/restore.

Only after these checks should the feature branch be merged into `main` and GitHub Pages updated.
