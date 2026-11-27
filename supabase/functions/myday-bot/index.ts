// MYDAY Telegram assistant webhook.
// Receives private bot messages, writes into the same per-user profile as the Mini App.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-telegram-bot-api-secret-token", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const enc = new TextEncoder();
const TZ = "Europe/Moscow";
let failureStage = "запуск функции";

type AnyRecord = Record<string, any>;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, "Content-Type": "application/json" } });
const isoToday = (tz = TZ) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function shiftDate(date: string, days: number) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function uid() { return crypto.randomUUID(); }
function escapeHtml(s: unknown) { return String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)); }
function profileSeed(): AnyRecord {
  return { v: 2, settings: { theme: "auto", morning: "07:30", shift: 0, notif: true, hwDelay: 60, notifications: { study: true, work: true, personal: true } }, sched: { odd: {}, even: {}, work: {}, fixed: {}, cycle: {}, dates: {} }, scheduleConfig: { studyMode: "alternating", cycleWeeks: 2, cycleAnchor: "", selectedDate: "" }, workConfig: { mode: "weekly", pattern: ["work", "work", "off", "off"], anchorDate: "", start: "09:00", end: "18:00", title: "Рабочая смена", exceptions: {} }, habits: [], tasks: [], inbox: [], fired: {}, done: [], uni: { name: "", url: "", login: "", notes: "", links: "", teachers: "" }, subjects: [], hw: [], exc: [], events: [] };
}
async function tg(method: string, body: AnyRecord) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error("Telegram " + method + " failed: " + (data.description || r.status));
  return data.result;
}
async function send(chatId: number, text: string, keyboard?: AnyRecord[][]) {
  return await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
}
async function getProfile(telegramId: number) {
  failureStage = "чтение профиля из Supabase";
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
  if (!key) throw new Error("Supabase server key missing");
  const headers = { apikey: key, "Content-Type": "application/json" };
  const url = base + "/rest/v1/myday_profiles?telegram_id=eq." + telegramId + "&select=data,revision";
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("Profile load failed: " + r.status);
  const rows = await r.json();
  const data = rows[0]?.data || profileSeed();
  return { data, baseData: JSON.parse(JSON.stringify(data)), revision: Number(rows[0]?.revision || 0), base, key, headers };
}
async function consumeAiQuota(telegramId: number, usageDate: string, limit = 100): Promise<boolean> {
  failureStage = "проверка дневного лимита AI";
  const profile = await getProfile(telegramId);
  const response = await fetch(profile.base + "/rest/v1/rpc/myday_consume_bot_ai", {
    method: "POST",
    headers: profile.headers,
    body: JSON.stringify({ p_telegram_id: telegramId, p_usage_date: usageDate, p_limit: limit })
  });
  if (!response.ok) throw new Error("AI quota check failed: " + response.status);
  return response.json();
}
function mergeBotChanges(latest: AnyRecord, incoming: AnyRecord, base: AnyRecord) {
  const merged = { ...latest };
  const latestTasks = Array.isArray(latest.tasks) ? [...latest.tasks] : [];
  const baseTasks = new Map((Array.isArray(base.tasks) ? base.tasks : []).map((t: AnyRecord) => [String(t.id), t]));
  const incomingTasks = Array.isArray(incoming.tasks) ? incoming.tasks : [];
  for (const task of incomingTasks) {
    const id = String(task.id || "");
    if (!id) continue;
    const before = baseTasks.get(id);
    const index = latestTasks.findIndex((t: AnyRecord) => String(t.id) === id);
    if (!before) {
      if (index < 0) latestTasks.push(task);
    } else if (index >= 0) {
      const changes: AnyRecord = {};
      for (const [key, value] of Object.entries(task)) {
        if (JSON.stringify((before as AnyRecord)[key]) !== JSON.stringify(value)) changes[key] = value;
      }
      if (Object.keys(changes).length) latestTasks[index] = { ...latestTasks[index], ...changes };
    }
  }
  merged.tasks = latestTasks;
  const baseInbox = Array.isArray(base.inbox) ? base.inbox : [];
  const incomingInbox = Array.isArray(incoming.inbox) ? incoming.inbox : [];
  const latestInbox = Array.isArray(latest.inbox) ? latest.inbox : [];
  const additions = incomingInbox.filter((item: AnyRecord) => !baseInbox.some((old: AnyRecord) => JSON.stringify(old) === JSON.stringify(item)) && !latestInbox.some((old: AnyRecord) => JSON.stringify(old) === JSON.stringify(item)));
  merged.inbox = [...additions, ...latestInbox].slice(0, 300);
  const baseEvents = Array.isArray(base.events) ? base.events : [];
  const incomingEvents = Array.isArray(incoming.events) ? incoming.events : [];
  const latestEvents = Array.isArray(latest.events) ? [...latest.events] : [];
  for (const event of incomingEvents) {
    const id = String(event.id || "");
    if (id && !baseEvents.some((old: AnyRecord) => String(old.id) === id) && !latestEvents.some((old: AnyRecord) => String(old.id) === id)) latestEvents.push(event);
  }
  merged.events = latestEvents;
  return merged;
}
async function saveProfile(telegramId: number, incoming: AnyRecord, baseData: AnyRecord) {
  failureStage = "сохранение задачи в Supabase";
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getProfile(telegramId);
    const merged = mergeBotChanges(current.data, incoming, baseData || {});
    const r = await fetch(current.base + "/rest/v1/rpc/myday_sync_profile", { method: "POST", headers: current.headers, body: JSON.stringify({ p_telegram_id: telegramId, p_data: merged, p_expected_revision: current.revision }) });
    if (!r.ok) throw new Error("Profile save failed: " + r.status);
    const rows = await r.json();
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (result && !result.conflict) return;
  }
  throw new Error("Не удалось сохранить: профиль одновременно изменяется в приложении. Повторите действие.");
}
async function markUpdate(updateId: number) {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
  const r = await fetch(base + "/rest/v1/myday_bot_updates?on_conflict=update_id", { method: "POST", headers: { apikey: key, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ update_id: updateId }) });
  if (!r.ok) { const details = (await r.text()).slice(0, 500); throw new Error("Update deduplication failed: HTTP " + r.status + (details ? " · " + details : "")); }
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
function inferTime(text: string) {
  const m = text.toLowerCase().match(/(?:в|на)\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return "";
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0") : "";
}
function inferDate(text: string, today: string) {
  const t = text.toLowerCase();
  if (/\bпослезавтра\b/.test(t)) return shiftDate(today, 2);
  if (/\bзавтра\b/.test(t)) return shiftDate(today, 1);
  if (/\bсегодня\b/.test(t)) return today;
  const m = t.match(/(?:до|к|на)\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) { const y = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : Number(today.slice(0,4)); return y + "-" + m[2].padStart(2,"0") + "-" + m[1].padStart(2,"0"); }
  return "";
}
function guessSpace(text: string) {
  const t = text.toLowerCase();
  if (/пара|лекци|лаборатор|курсов|преподав|зач[её]т|экзамен|универ|предмет|домашн/.test(t)) return "study";
  if (/работ|смен|заказ|клиент|проект|офис/.test(t)) return "work";
  return "personal";
}
function guessCategory(space: string) { return space === "study" ? "Учёба" : space === "work" ? "Работа и проекты" : "Другое"; }
async function aiInterpret(text: string, today: string, userId: number, mode = "text"): Promise<AnyRecord | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  const prompt = `Ты — персональный помощник-планировщик MYDAY. Сегодня ${today}. Понимай русскую разговорную речь, в том числе голосовую расшифровку. Верни только JSON: {"intent":"add|add_event|list_today|list_week|list_tasks|complete|delete|reschedule|note|help|clarify","tasks":[{"title":"...","desc":"","space":"study|work|personal","cat":"Учёба|Работа и проекты|Другое","due":"YYYY-MM-DD или пусто","prio":0}],"events":[{"title":"...","type":"Экзамен|Зачёт|Консультация|Сдача работы|Событие","date":"YYYY-MM-DD","time":"HH:MM или пусто","endTime":"HH:MM или пусто"}],"task_query":"","due":"YYYY-MM-DD или пусто","note":"","reply":""}. ВАЖНО: если пользователь описывает интервал времени словами «с ... до ...», это событие/запись расписания, а не обычная задача. Всегда разбирай ОБА времени и заполняй time и endTime в формате HH:MM. Примеры: «с 7 вечера до полдвенадцатого» = time 19:00, endTime 23:30; «с 9 до 11 утра» = 09:00–11:00; «с 8 вечера до 12 ночи» = 20:00–00:00. Слова «работа/смена» с указанным интервалом также создают событие с названием «Работа». Если дата не названа, не выдумывай её: выбери clarify и спроси, на какой день поставить запись, сохранив распознанный интервал. При создании события дату указывай только если она явно названа или однозначно следует из слов сегодня/завтра/послезавтра/день недели. При нескольких делах создай несколько tasks. Для завершения, удаления или переноса существующей задачи используй task_query с её названием; для переноса также заполни due. Если задачу нельзя однозначно определить, выбери clarify и задай один короткий вопрос. prio: 0 высокий, 1 обычный, 2 низкий. ${mode === "voice" ? "Текст получен из голосового сообщения." : ""}`;
  try {
    if (!await consumeAiQuota(userId, today)) throw new Error("MYDAY_AI_DAILY_LIMIT");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: controller.signal, headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("GROQ_CHAT_MODEL") || "openai/gpt-oss-120b", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: text.slice(0, 8000) }] }) });
    clearTimeout(timeout);
    if (!r.ok) { console.error("MYDAY AI parsing failed:", r.status, (await r.text()).slice(0, 300)); return null; }
    const d = await r.json();
    const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (String(error).includes("MYDAY_AI_DAILY_LIMIT")) throw error;
    console.error("MYDAY AI unavailable; using safe text fallback:", error);
    return null;
  }
}
async function telegramFile(fileId: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const meta = await (await fetch("https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(fileId))).json();
  if (!meta.ok || !meta.result?.file_path) throw new Error("Не удалось получить файл из Telegram");
  const r = await fetch("https://api.telegram.org/file/bot" + token + "/" + meta.result.file_path);
  if (!r.ok) throw new Error("Не удалось скачать файл из Telegram");
  return { blob: await r.blob(), name: meta.result.file_path.split("/").pop() || "voice.ogg" };
}
async function transcribe(fileId: string, userId: number, today: string) {
  if (!Deno.env.get("GROQ_API_KEY")) return "";
  if (!await consumeAiQuota(userId, today)) throw new Error("MYDAY_AI_DAILY_LIMIT");
  failureStage = "загрузка голосового сообщения";
  const { blob, name } = await telegramFile(fileId);
  // Telegram voice notes are commonly delivered as .oga. Groq accepts OGG,
  // so normalize the upload filename and MIME type instead of forwarding .oga.
  const isOgg = /\.(oga|ogg)$/i.test(name) || /audio\/(ogg|opus)/i.test(blob.type);
  const uploadName = isOgg ? "voice.ogg" : name;
  const mimeType = isOgg ? "audio/ogg" : (blob.type || "audio/mpeg");
  const file = new File([blob], uploadName, { type: mimeType });
  const form = new FormData();
  form.append("file", file);
  form.append("model", Deno.env.get("GROQ_TRANSCRIPTION_MODEL") || "whisper-large-v3-turbo");
  form.append("language", "ru");
  failureStage = "распознавание голосового сообщения";
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY")! }, body: form });
  if (!r.ok) {
    const detail = (await r.text()).replace(/\s+/g, " ").slice(0, 350);
    throw new Error("Groq transcription HTTP " + r.status + (detail ? ": " + detail : ""));
  }
  const d = await r.json();
  return String(d.text || "");
}
async function vision(fileId: string, userId: number, today: string) {
  if (!Deno.env.get("GROQ_API_KEY")) return "";
  if (!await consumeAiQuota(userId, today)) throw new Error("MYDAY_AI_DAILY_LIMIT");
  const { blob } = await telegramFile(fileId);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  const dataUrl = "data:" + (blob.type || "image/jpeg") + ";base64," + btoa(binary);
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY")!, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("GROQ_VISION_MODEL") || "qwen/qwen3.8-27b", response_format: { type: "json_object" }, messages: [{ role: "system", content: "Извлеки с изображения задания, сроки, предметы и события. Верни JSON {intent:'add',tasks:[{title,desc,space,cat,due,prio}]} . Не выдумывай нечитаемый текст и даты." }, { role: "user", content: [{ type: "text", text: "Разбери фото как входящее задание для MYDAY." }, { type: "image_url", image_url: { url: dataUrl } }] }] }) });
  if (!r.ok) throw new Error("Не удалось разобрать фото: " + r.status);
  const d = await r.json(); try { return JSON.parse(d.choices?.[0]?.message?.content || "{}"); } catch { return ""; }
}
function taskKeyboard(tasks: Array<[string, string]>) { return tasks.map(([id, title]) => [{ text: "✓ " + String(title).slice(0, 28), callback_data: "done:" + id }, { text: "Завтра", callback_data: "tomorrow:" + id }, { text: "Удалить", callback_data: "delete:" + id }]); }
async function handleText(chatId: number, userId: number, text: string) {
  failureStage = "разбор команды";
  const cmd = text.trim();
  if (/^\/(start|help)(\s|$)/i.test(cmd)) {
    await send(chatId, "Привет! Я <b>MYDAY Assistant</b> — твой планировщик прямо в Telegram.\n\nНапиши задачу обычными словами или отправь голосовое. Например: «Сдать лабораторную по теплотехнике до пятницы» или «Завтра в 18:00 тренировка».\n\nКоманды: /today, /week, /tasks, /app, /help", [[{ text: "Сегодня", callback_data: "view:today" }, { text: "Мои задачи", callback_data: "view:tasks" }], [{ text: "Открыть MYDAY", web_app: { url: "https://dgworkingww-cpu.github.io/myday/" } }]]);
    return;
  }
  const p = await getProfile(userId);
  const today = isoToday(p.data.settings?.timezone || TZ);
  if (/^\/app\b/i.test(cmd)) { await send(chatId, "Открыть приложение:", [[{ text: "Запустить MYDAY", web_app: { url: "https://dgworkingww-cpu.github.io/myday/" } }]]); return; }
  if (/^\/(today|week|tasks)\b/i.test(cmd)) {
    const mode = cmd.match(/^\/(\w+)/)![1];
    const tasks = (Array.isArray(p.data.tasks) ? p.data.tasks : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2);
    const end = mode === "today" ? today : shiftDate(today, 7);
    const list = mode === "today" ? tasks.filter((x: AnyRecord) => !x.due || x.due <= today) : mode === "week" ? tasks.filter((x: AnyRecord) => !x.due || x.due <= end) : tasks;
    const events = mode === "tasks" ? [] : (Array.isArray(p.data.events) ? p.data.events : []).filter((x: AnyRecord) => x.date >= today && x.date <= end).sort((a: AnyRecord, b: AnyRecord) => a.date.localeCompare(b.date));
    const label = mode === "today" ? "План на сегодня" : mode === "week" ? "План на ближайшие 7 дней" : "Все открытые задачи";
    if (!list.length && !events.length) { await send(chatId, label + ": пока пусто. Подозрительно, но пользуйся моментом."); return; }
    const taskLines = list.slice(0, 20).map((x: AnyRecord, i: number) => (i + 1) + ". " + escapeHtml(x.title) + (x.due ? " · " + x.due : ""));
    const eventLines = events.slice(0, 10).map((x: AnyRecord) => "📌 " + escapeHtml(x.title) + " · " + x.date + (x.time ? " · " + x.time : ""));
    await send(chatId, "<b>" + label + "</b>\n" + [...taskLines, ...eventLines].join("\n"), taskKeyboard(list.slice(0, 8).map((x: AnyRecord): [string, string] => [String(x.id), String(x.title)])));
    return;
  }
  if (/^\/done\s+/i.test(cmd)) {
    const id = cmd.replace(/^\/done\s+/i, "").trim();
    const t = (p.data.tasks || []).find((x: AnyRecord) => String(x.id) === id);
    if (!t) { await send(chatId, "Не нашёл такую задачу."); return; }
    t.status = 2; await saveProfile(userId, p.data, p.baseData); await send(chatId, "Готово: <b>" + escapeHtml(t.title) + "</b> отмечена выполненной."); return;
  }
  const eventLike = /тренировк|встреч|при[её]м|врач|экзамен|зач[её]т|консультац|день рождения|собеседован|мероприят/i.test(cmd);
  const fallbackSpace = guessSpace(cmd);
  failureStage = "распознавание текста";
  const payload = await aiInterpret(cmd, today, userId) || (eventLike
    ? { intent: "add_event", tasks: [], events: [{ title: cmd, type: /экзамен/i.test(cmd) ? "Экзамен" : /зач[её]т/i.test(cmd) ? "Зачёт" : "Событие", date: inferDate(cmd, today) }] }
    : { intent: "add", tasks: [{ title: cmd, desc: "", space: fallbackSpace, cat: guessCategory(fallbackSpace), due: inferDate(cmd, today), prio: 1 }] });
  // A spoken time interval is a schedule entry, never a plain task.
  const hasSpokenTimeRange = /\bс\s+.+\bдо\s+.+/i.test(cmd);
  if (hasSpokenTimeRange && payload.intent === "add") {
    payload.intent = "clarify";
    payload.reply = "Я услышал интервал работы, но не дату. На какой день поставить эту запись? Отправь дату, например: «сегодня» или «завтра», вместе с интервалом ещё раз.";
  }
  if (payload.intent === "clarify") { await send(chatId, escapeHtml(payload.reply || "Уточни, пожалуйста, дату или к какому разделу относится задача.")); return; }
  if (payload.intent === "list_today" || payload.intent === "list_tasks" || payload.intent === "list_week") {
    await handleText(chatId, userId, payload.intent === "list_today" ? "/today" : payload.intent === "list_week" ? "/week" : "/tasks");
    return;
  }
  if (payload.intent === "note") { p.data.inbox = Array.isArray(p.data.inbox) ? p.data.inbox : []; p.data.inbox.unshift({ text: String(payload.note || cmd), d: today }); await saveProfile(userId, p.data, p.baseData); await send(chatId, "Сохранил в заметки."); return; }
  if (["complete", "delete", "reschedule"].includes(String(payload.intent))) {
    const query = String(payload.task_query || "").trim().toLocaleLowerCase("ru");
    if (!query) { await send(chatId, "Не понял, какую задачу изменить. Напиши её название."); return; }
    const candidates = (Array.isArray(p.data.tasks) ? p.data.tasks : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2 && String(x.title || "").toLocaleLowerCase("ru").includes(query));
    if (!candidates.length) { await send(chatId, "Не нашёл открытую задачу по запросу «" + escapeHtml(payload.task_query) + "». Покажи список командой /tasks."); return; }
    if (candidates.length > 1) {
      const action = String(payload.intent);
      const keyboard = candidates.slice(0, 8).map((x: AnyRecord) => [{ text: String(x.title).slice(0, 45), callback_data: action + ":" + x.id }]);
      await send(chatId, "Нашёл несколько похожих задач. Выбери нужную:", keyboard);
      return;
    }
    const task = candidates[0];
    if (payload.intent === "complete") {
      task.status = 2; await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "✓ Отметил выполненной: <b>" + escapeHtml(task.title) + "</b>"); return;
    }
    if (payload.intent === "delete") {
      await send(chatId, "Удалить задачу <b>" + escapeHtml(task.title) + "</b>?", [[{ text: "Удалить задачу", callback_data: "delete_confirm:" + task.id }, { text: "Отмена", callback_data: "delete_cancel:" + task.id }]]);
      return;
    }
    const due = String(payload.due || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { await send(chatId, "На какую дату перенести «" + escapeHtml(task.title) + "»? Напиши, например: «на пятницу» или «на 12.12»."); return; }
    task.due = due; await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Перенёс <b>" + escapeHtml(task.title) + "</b> на " + due + "."); return;
  }
  if (payload.intent === "add_event") {
    const incomingEvents = Array.isArray(payload.events) ? payload.events : [];
    if (!incomingEvents.length) { await send(chatId, "Не смог определить событие и дату. Напиши, например: «Экзамен по теплотехнике 12.12»."); return; }
    p.data.events = Array.isArray(p.data.events) ? p.data.events : [];
    const datedEvents = incomingEvents.filter((x: AnyRecord) => /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) || !!inferDate(cmd, today));
    if (!datedEvents.length) { await send(chatId, "Событие понял, но дату не разобрал. Напиши, например: «Тренировка завтра в 18:00»."); return; }
    const createdEvents = datedEvents.slice(0, 10).map((x: AnyRecord) => ({ id: uid(), title: String(x.title || cmd).slice(0, 240), type: String(x.type || "Событие"), date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? x.date : inferDate(cmd, today), time: /^\d{2}:\d{2}$/.test(String(x.time || "")) ? x.time : inferTime(cmd), endTime: /^\d{2}:\d{2}$/.test(String(x.endTime || "")) ? x.endTime : "" }));
    p.data.events.push(...createdEvents);
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Добавил событие в календарь MYDAY:\n" + createdEvents.map((x: AnyRecord) => "📌 <b>" + escapeHtml(x.title) + "</b> · " + x.date + (x.time ? " · " + x.time + (x.endTime ? "–" + x.endTime : "") : "")).join("\n"));
    return;
  }
  if (payload.intent === "help") { await send(chatId, "Напиши задачу обычным текстом, отправь голосовое или используй /today, /week, /tasks."); return; }
  const incoming = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (!incoming.length) { await send(chatId, "Не понял, что сохранить. Попробуй сформулировать как задачу."); return; }
  p.data.tasks = Array.isArray(p.data.tasks) ? p.data.tasks : [];
  const created: AnyRecord[] = [];
  for (const raw of incoming.slice(0, 10)) {
    const title = String(raw.title || "").trim(); if (!title) continue;
    const space = ["study", "work", "personal"].includes(raw.space) ? raw.space : guessSpace(title);
    const task = { id: uid(), title: title.slice(0, 240), desc: String(raw.desc || "").slice(0, 2000), cat: String(raw.cat || guessCategory(space)), space, due: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.due || "")) ? raw.due : inferDate(title, today), prio: [0,1,2].includes(Number(raw.prio)) ? Number(raw.prio) : 1, status: 0, subs: [], repeat: "", created: today };
    p.data.tasks.push(task); created.push(task);
  }
  if (!created.length) { await send(chatId, "Не смог выделить название задачи."); return; }
  await saveProfile(userId, p.data, p.baseData);
  failureStage = "отправка подтверждения в Telegram";
  const summary = created.map((x, i) => (i + 1) + ". <b>" + escapeHtml(x.title) + "</b>" + (x.due ? " · " + x.due : "")).join("\n");
  await send(chatId, "Сохранил в MYDAY и синхронизировал с приложением:\n" + summary, taskKeyboard(created.map((x): [string, string] => [String(x.id), String(x.title)])));
}
async function handleCallback(q: AnyRecord) {
  const userId = Number(q.from?.id), chatId = Number(q.message?.chat?.id), data = String(q.data || "");
  if (!userId || !chatId) return;
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  if (data.startsWith("view:")) { await handleText(chatId, userId, "/" + data.slice(5)); return; }
  if (q.message?.chat?.type !== "private") return;
  const p = await getProfile(userId), parts = data.split(":"), action = parts[0], id = parts.slice(1).join(":");
  const task = (p.data.tasks || []).find((x: AnyRecord) => String(x.id) === id);
  if (!task) { await send(chatId, "Эта задача уже не найдена."); return; }
  if (action === "done" || action === "complete") { task.status = 2; await saveProfile(userId, p.data, p.baseData); await send(chatId, "✓ Выполнено: <b>" + escapeHtml(task.title) + "</b>"); }
  else if (action === "tomorrow") { task.due = shiftDate(isoToday(p.data.settings?.timezone || TZ), 1); await saveProfile(userId, p.data, p.baseData); await send(chatId, "Перенёс на завтра: <b>" + escapeHtml(task.title) + "</b>"); }
  else if (action === "delete") { await send(chatId, "Точно удалить <b>" + escapeHtml(task.title) + "</b>?", [[{ text: "Да, удалить", callback_data: "delete_confirm:" + id }, { text: "Не удалять", callback_data: "delete_cancel:" + id }]]); }
  else if (action === "delete_confirm") { p.data.tasks = (p.data.tasks || []).filter((x: AnyRecord) => String(x.id) !== id); await saveProfile(userId, p.data, p.baseData); await send(chatId, "Удалил задачу: <b>" + escapeHtml(task.title) + "</b>"); }
  else if (action === "delete_cancel") { await send(chatId, "Оставил задачу без изменений."); }
  else if (action === "reschedule") { await send(chatId, "На какую дату перенести <b>" + escapeHtml(task.title) + "</b>? Напиши дату сообщением."); }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("MYDAY_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ error: "Unauthorized" }, 401);
  let fallbackChatId = 0;
  try {
    failureStage = "чтение входящего обновления Telegram";
    const update = await req.json();
    fallbackChatId = Number(update.message?.chat?.id || update.callback_query?.message?.chat?.id || 0);
    failureStage = "проверка повторного обновления";
    if (Number.isSafeInteger(update.update_id)) {
      const fresh = await markUpdate(Number(update.update_id));
      if (!fresh) return json({ ok: true, duplicate: true });
    }
    if (update.callback_query) { failureStage = "обработка нажатия кнопки"; await handleCallback(update.callback_query); }
    else if (update.message) {
      const m = update.message, chatId = Number(m.chat?.id), userId = Number(m.from?.id);
      if (!chatId || !userId || m.chat?.type !== "private") return json({ ok: true });
      let text = String(m.text || m.caption || "").trim();
      if (m.voice?.file_id || m.audio?.file_id) {
        const transcript = await transcribe(m.voice?.file_id || m.audio.file_id, userId, isoToday());
        if (!transcript) { await send(chatId, "Голосовое получил, но распознавание пока не подключено. Для него нужен бесплатный GROQ_API_KEY в секретах проекта."); return json({ ok: true }); }
        await send(chatId, "🎙 Распознал: «" + escapeHtml(transcript) + "»\nСекунду, добавляю…");
        text = transcript;
      } else if (m.photo?.length) {
        const parsed = await vision(m.photo[m.photo.length - 1].file_id, userId, isoToday());
        if (!parsed || !Array.isArray(parsed.tasks) || !parsed.tasks.length) { await send(chatId, "Фото получил, но не смог уверенно выделить задачи. Пришли более чёткий снимок или текстом."); return json({ ok: true }); }
        text = parsed.tasks.map((x: AnyRecord) => x.title + (x.due ? " до " + x.due : "")).join("; ");
      } else if (m.document) {
        const mime = String(m.document.mime_type || "");
        if (/text\/(plain|csv)|application\/(json|pdf)/i.test(mime)) {
          const { blob } = await telegramFile(m.document.file_id);
          if (blob.size > 1_000_000) { await send(chatId, "Файл слишком большой для быстрой обработки в чате. Максимум 1 МБ."); return json({ ok: true }); }
          if (/text\/(plain|csv)|application\/json/i.test(mime)) text = await blob.text();
          else { await send(chatId, "PDF получил. Для точного импорта расписания открой Mini App → Расписание → Импорт. Прямой разбор PDF в чате добавим отдельным этапом."); return json({ ok: true }); }
        } else { await send(chatId, "Файл получил. Для импорта Excel/DOCX пока используй раздел импорта внутри Mini App."); return json({ ok: true }); }
      }
      if (text) { failureStage = "обработка текстового сообщения"; await handleText(chatId, userId, text); }
      else if (!m.voice && !m.audio && !m.photo && !m.document) await send(chatId, "Напиши задачу текстом или отправь голосовое. Команды: /today, /week, /tasks, /app.");
    }
    return json({ ok: true });
  } catch (error) {
    console.error("MYDAY bot webhook error:", error);
    if (fallbackChatId) {
      try {
        const message = String(error).includes("MYDAY_AI_DAILY_LIMIT")
          ? "На сегодня исчерпан лимит AI-запросов MYDAY (100). Обычные команды и текстовое добавление задач остаются доступны."
          : "Не получилось обработать сообщение.\nЭтап: " + failureStage + ".\nПричина: " + (error instanceof Error ? error.message : "неизвестная ошибка") + ".\nПроверь /tasks, чтобы не создать дубликат.";
        await send(fallbackChatId, message);
      } catch { /* Telegram may be temporarily unavailable */ }
    }
    return json({ ok: true });
  }
});
