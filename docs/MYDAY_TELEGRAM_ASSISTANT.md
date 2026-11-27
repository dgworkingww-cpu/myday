# MYDAY Telegram Assistant

## Product direction

The Telegram bot is the conversational front door to the same personal MYDAY profile used by the Mini App. A task created in chat is written to `myday_profiles.data.tasks`; the Mini App reads the same record after cloud sync. Each Telegram user is isolated by their Telegram numeric ID.

## Available in this implementation

1. Natural-language task entry in a private bot chat.
2. AI extraction of multiple tasks from one message (requires `GROQ_API_KEY`).
3. Voice-message transcription in Russian (requires `GROQ_API_KEY`).
4. Photo understanding for handwritten/printed assignment snapshots (requires `GROQ_API_KEY`).
5. Forwarded teacher messages can be processed as ordinary text.
6. Automatic study/work/personal category suggestion.
7. Explicit and relative due-date extraction (today/tomorrow/day after tomorrow and numeric dates).
8. Multiple tasks can be created from one message.
9. Personal notes can be sent to the inbox when the AI identifies a note intent.
10. `/today` view.
11. `/week` view.
12. `/tasks` view.
13. Inline completion button on each task.
14. Inline postpone-until-tomorrow button.
15. `/done ID` completion command.
16. `/app` deep link to open the Mini App.
17. `/start` and `/help` onboarding.
18. Optimistic revision-safe writes shared with the Mini App.
19. Telegram update deduplication to avoid duplicate tasks on webhook retries.
20. Private-chat-only handling; group messages are ignored.
21. One message may create up to ten separate tasks.
22. Bot replies confirm what was saved and show quick actions.
23. Calendar events (appointments, training, exams and consultations) can be captured from a message, including a date and time.
24. The /today and /week agenda combines tasks and calendar events.
25. Event times are displayed in the Mini App calendar and upcoming-events list.

## Additional product innovations to build next

- Ask a follow-up question and retain a short-lived pending action when the date or subject is genuinely ambiguous.
- Edit, rename, delete, reprioritize and reassign tasks through conversational commands and inline controls.
- Parse PDF, DOCX and XLSX attachments directly in the chat, including multi-group university timetables.
- Extract tasks and deadlines from voice, photos, PDFs and forwarded announcements into one review queue.
- Daily morning briefing and evening completion recap.
- Configurable reminders with snooze, quiet hours and separate study/work/personal channels.
- Break large assignments into subtasks and milestones.
- Build a realistic weekly plan from the user's free time and existing calendar.
- Detect overloaded days and suggest moving flexible tasks.
- Search across tasks, notes, subjects and past bot messages.
- Focus sessions with start/pause/finish controls in chat.
- Habit check-ins and streak summaries.
- Recurring tasks and recurring events managed conversationally.
- Work-shift and university schedule questions in natural language.
- Natural-language changes such as “перенеси лабораторную на пятницу” and “покажи только учёбу”.
- Optional voice replies and spoken daily summaries.
- User-specific timezone, language, notification and assistant-tone preferences.
- A confirmation preview before any bulk import or destructive action.

## Deployment requirements

- Existing GitHub Actions secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `TELEGRAM_BOT_TOKEN`.
- Required for AI features (voice transcription, photo understanding and robust natural-language parsing): `GROQ_API_KEY` (create a free GroqCloud API key and add it as a Supabase Edge Function secret).\n- Default text model: `openai/gpt-oss-120b`; default vision model: `qwen/qwen3.8-27b`; default speech model: `whisper-large-v3-turbo`. Model IDs can be overridden with `GROQ_CHAT_MODEL`, `GROQ_VISION_MODEL` and `GROQ_TRANSCRIPTION_MODEL`.\n- Free-tier quotas are shared across the Groq organization and can change. Add per-user limits and graceful 429 handling before opening the bot to a large public audience.
- The backend workflow applies migration `005_myday_bot_updates.sql`, deploys `myday-bot`, generates a webhook secret server-side, and registers the Telegram webhook.
- The webhook secret and bot token remain server-side. Never place either in frontend files.
- Webhook registration only occurs when the backend deployment workflow runs on the protected deployment branch. A feature-branch PR does not change the live bot.
