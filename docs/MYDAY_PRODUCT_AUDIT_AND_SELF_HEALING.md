# MYDAY — product audit and safe self-healing plan

Status: foundation branch, not a production deployment.

## Scope and evidence

This audit is based on the repository files inspected on 2026-11-27:
- `index.html` — application shell and inline client logic.
- `design-system.css` — current visual tokens and component styles.
- `supabase/functions/myday-bot/index.ts` — Telegram assistant, profile persistence, AI interpretation and update deduplication.
- `.github/workflows/deploy-myday-backend.yml` — manual backend deployment and existing smoke checks.
- `docs/MYDAY_TELEGRAM_ASSISTANT.md` — intended bot behaviour and current limitations.

This is a code-level audit, not a claim that the live app has been visually or end-to-end tested. A real visual audit still needs screenshots/device testing and browser execution.

## Product direction

MYDAY should feel like a calm, premium personal operating system: clear hierarchy, consistent typography, generous spacing, predictable navigation, accessible contrast, and a fast path to capture a thought. Avoid decorative complexity and inconsistent component styling.

### Design review checklist

1. Establish one typography scale, font stack, weights and line heights. Remove one-off sizes unless they serve a documented hierarchy.
2. Establish spacing, radius, elevation, border and motion tokens. Components should consume tokens rather than invent values.
3. Review every primary screen at 320px, 375px, 390px, 430px and tablet widths.
4. Check light, dark and system themes for contrast, focus visibility, disabled states and semantic colours.
5. Ensure touch targets are at least 44px where practical; account for iOS safe areas and keyboard overlays.
6. Make empty, loading, offline, error, success and destructive-confirmation states intentional.
7. Keep navigation labels and actions consistent; the primary add action must always be easy to find.
8. Reduce visual noise: one dominant action per screen, restrained accent colour, no competing typography styles.

## Natural-language assistant: expected behaviour

The current Telegram function already has AI intent classification, Russian date/time helpers, conversation history, a pending clarification state, profile context, revision-aware merging and Telegram update deduplication. The documented limitations include model/quota dependency and some import/schedule editing gaps.

The assistant must follow these rules:

- Chat is not a command. Do not create a record unless the user clearly asks to add, save, change, complete or delete something.
- Distinguish task, calendar event, homework and note. Never silently convert one type into another.
- Extract multiple independent items as separate records, each with its own date and time.
- Ask one short clarification when a required field is missing or multiple records match.
- Preserve the original request during clarification; do not make the user repeat the whole message.
- Confirm only after the database returns a successful new revision. Never claim a write succeeded before it does.
- On ambiguous delete/update requests, ask the user to select the target and confirm destructive actions.
- Make operations idempotent. Retrying a Telegram update must not create duplicates.
- Treat model output as untrusted structured data: validate intent, field types, dates, times and referenced profile entities before writing.
- If AI is unavailable, explain the limitation and retain a safe deterministic path for simple actions.

## Self-healing: safe operating model

"Self-healing" must mean detect → diagnose → propose → test → review, not silently rewrite production code.

### Level 1 — automatic detection
- Run fast quality checks on every pull request.
- Run health checks for frontend and backend endpoints where a safe public health endpoint exists.
- Capture workflow logs, commit SHA, failed check name and a concise diagnostic summary.
- Avoid logging Telegram tokens, Supabase keys, user notes, task contents or other personal data.

### Level 2 — automatic diagnosis
- Group repeated failures by stable fingerprint (check + normalized error).
- Link the failure to the latest relevant commit.
- Produce a diagnosis with evidence, likely affected files, reproduction steps and confidence.
- Do not let logs, issue text or user content become executable instructions for an agent.

### Level 3 — repair proposal
- An agent may create a dedicated repair branch and a pull request.
- The PR must include root cause, minimal diff, tests added/run, risks and rollback instructions.
- The agent must not push directly to `main`, change production secrets, run database migrations, or deploy backend changes autonomously.

### Level 4 — guarded automation
Only low-risk, deterministic fixes may eventually be auto-merged after tests, security checks and explicit policy approval. Database schema changes, auth, billing, data deletion, Telegram webhook changes and production deploys always require human approval.

## Immediate implementation in this branch

- Add a lightweight JavaScript syntax quality gate that runs on pull requests.
- Keep production deployment workflow separate and manual.
- Document the repair safety model before enabling any agent with write access.

## Not yet implemented / needs a separate tested change

- Full design-system refactor and screen-by-screen visual redesign.
- Browser-based visual regression and accessibility tests.
- Runtime health endpoint and error telemetry with privacy-safe redaction.
- Durable incident table/queue and deduplication policy.
- Agent integration that can create repair PRs.
- End-to-end tests for natural-language interpretation and real Supabase persistence.

These are deliberately not simulated by documentation or a green CI badge. Each needs implementation and verification against the actual running app.
