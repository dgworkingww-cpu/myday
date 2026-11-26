# MYDAY cloud sync setup

The cloud-sync work stays on `feature/multi-user-myday`. The live GitHub Pages app is unchanged until backend deployment and integration tests pass.

## Supabase project

- Project ref: `rzgsctbvgzerqizfjhuq`
- Project URL: `https://rzgsctbvgzerqizfjhuq.supabase.co`
- Region: Frankfurt / Central EU

Keep the database password and all API secrets private.

## Deploy through GitHub Actions

A manual workflow is available at **Actions → Deploy and validate MYDAY backend → Run workflow**. In the **Branch** dropdown, select `feature/multi-user-myday` so the workflow uses the migration and function code from the unmerged feature branch. Before running it, add these repository Actions secrets in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token created in Supabase Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Database password chosen when the Supabase project was created |
| `TELEGRAM_BOT_TOKEN` | Token for the MYDAY bot from BotFather |

Enter each value directly into GitHub's secret form. Never commit them, put them in `backend-config.js`, or send them in chat.

The workflow runs on changes to the frontend or Supabase backend and serializes deployments to avoid overlapping migrations. It:
1. Links the CLI to the MYDAY Supabase project.
2. Applies all pending migrations, including `001_myday_profiles.sql`, `002_myday_sync_revisions.sql`, and `003_myday_service_role_grants.sql`.
3. Sets `TELEGRAM_BOT_TOKEN` as a server-side Edge Function secret. Supabase injects `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` automatically.
4. Deploys `myday-sync`.
5. Checks frontend JavaScript syntax.
6. Creates signed Telegram test data using the GitHub secret, verifies invalid signatures are rejected, performs a real profile load/save, and confirms stale writes are rejected with HTTP 409.

The integration test uses a two reserved synthetic IDs above Telegram's 52-bit user-ID range (`9007199254740000` and `9007199254740001`) and two small CI-only rows in the profiles table; it never touches a real user's profile.

If the workflow fails, inspect the Actions run log. Secret values are not printed by the workflow.

## Database and security

The migrations create one private row per Telegram ID in `public.myday_profiles`, add a monotonically increasing `revision`, and define an atomic compare-and-swap RPC for writes. RLS is enabled, and direct table grants to `anon` and `authenticated` are revoked. The Edge Function reads the Supabase secret key from the injected `SUPABASE_SECRET_KEYS` (with a legacy service-role fallback) and uses it only in the `apikey` header for server-side REST calls. It does not send the new non-JWT secret key as a Bearer token.

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
3. Automated CI tests a real signed Telegram payload, database load/save, and stale-write conflict rejection.
4. On actual devices, confirm the signed Telegram profile is shown and the sync status is active.
5. Test isolation with a second Telegram account.
6. Test the same account on two devices, including simultaneous edits and offline reconnect.
7. Verify legacy local-data import, conflict backup download, and export/restore.

Only after these checks should the feature branch be merged into `main` and GitHub Pages updated.
