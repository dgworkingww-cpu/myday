// MYDAY Telegram assistant webhook.
// Receives private bot messages, writes into the same per-user profile as the Mini App.
import { inferDate, inferTime, inferTimeRange, isCancellation, isDateOnlyReply, validDate, validTime } from "./language.ts";
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
  return { v: 2, settings: { theme: "auto", morning: "07:30", shift: 0, notif: true, hwDelay: 60, notifications: { study: true, work: true, personal: true } }, sched: { odd: {}, even: {}, work: {}, fixed: {}, cycle: {}, dates: {} }, scheduleConfig: { studyMode: "alternating", cycleWeeks: 2, cycleAnchor: "", selectedDate: "" }, workConfig: { mode: "weekly", pattern: ["work", "work", "off", "off"], anchorDate: "", start: "09:00", end: "18:00", title: "Рабочая смена", exceptions: {} }, habits: [], tasks: [], inbox: [], fired: {}, done: [], uni: { name: "", url: "", login: "", notes: "", links: "", teachers: "" }, subjects: [], hw: [], exc: [], events: [], botState: { pending: null } };
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
  // Merge keyed collections by id so bot edits/deletions survive revision retries
  // without overwriting unrelated changes made in the Mini App.
  for (const key of ["tasks", "events", "hw"]) {
    const latestItems = Array.isArray(latest[key]) ? [...latest[key]] : [];
    const baseItems = Array.isArray(base[key]) ? base[key] : [];
    const incomingItems = Array.isArray(incoming[key]) ? incoming[key] : [];
    const baseById = new Map(baseItems.map((item: AnyRecord) => [String(item.id), item]));
    const incomingById = new Map(incomingItems.map((item: AnyRecord) => [String(item.id), item]));
    for (const item of incomingItems) {
      const id = String(item.id || "");
      if (!id) continue;
      const before = baseById.get(id);
      const index = latestItems.findIndex((x: AnyRecord) => String(x.id) === id);
      if (!before) {
        if (index < 0) latestItems.push(item);
      } else if (index >= 0) {
        const changes: AnyRecord = {};
        for (const [field, value] of Object.entries(item)) {
          if (JSON.stringify((before as AnyRecord)[field]) !== JSON.stringify(value)) changes[field] = value;
        }
        if (Object.keys(changes).length) latestItems[index] = { ...latestItems[index], ...changes };
      }
    }
    // A missing item is a deliberate deletion only when it existed in the caller's base snapshot.
    for (const before of baseItems) {
      const id = String((before as AnyRecord).id || "");
      if (id && !incomingById.has(id)) {
        const index = latestItems.findIndex((x: AnyRecord) => String(x.id) === id);
        if (index >= 0) latestItems.splice(index, 1);
      }
    }
    merged[key] = latestItems;
  }
  const baseInbox = Array.isArray(base.inbox) ? base.inbox : [];
  const incomingInbox = Array.isArray(incoming.inbox) ? incoming.inbox : [];
  const latestInbox = Array.isArray(latest.inbox) ? latest.inbox : [];
  const additions = incomingInbox.filter((item: AnyRecord) => !baseInbox.some((old: AnyRecord) => JSON.stringify(old) === JSON.stringify(item)) && !latestInbox.some((old: AnyRecord) => JSON.stringify(old) === JSON.stringify(item)));
  merged.inbox = [...additions, ...latestInbox].slice(0, 300);
  if (JSON.stringify(base.botState ?? null) !== JSON.stringify(incoming.botState ?? null)) merged.botState = incoming.botState ?? null;
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
function guessSpace(text: string) {
  const t = text.toLowerCase();
  if (/пара|лекци|лаборатор|курсов|преподав|зач[её]т|экзамен|универ|предмет|домашн/.test(t)) return "study";
  if (/работ|смен|заказ|клиент|проект|офис/.test(t)) return "work";
  return "personal";
}
function guessCategory(space: string) { return space === "study" ? "Учёба" : space === "work" ? "Работа и проекты" : "Другое"; }
async function aiInterpret(text: string, today: string, userId: number, mode = "text", profileContext = ""): Promise<AnyRecord | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  const prompt = [
    "Ты — внимательный, точный персональный помощник-планировщик MYDAY. Сегодня " + today + ". Общайся на русском, естественно и коротко. Понимай разговорную речь, опечатки, обрывки фраз и расшифровки голосовых сообщений.",
    "Верни ТОЛЬКО один JSON-объект без Markdown. Схема: {intent, tasks:[{title,desc,space,cat,due,prio}], events:[{title,type,date,time,endTime}], homework:[{subject,title,desc,due}], task_query, event_query, homework_query, subject, due, title, time, endTime, prio, note, reply}.",
    "Допустимые intent: add, add_event, add_homework, list_today, list_date, list_week, list_tasks, list_events, list_homework, complete, delete, reschedule, update_task, complete_homework, delete_homework, reschedule_homework, delete_event, reschedule_event, update_event, note, help, clarify.",
    "КЛАССИФИКАЦИЯ: задача — действие, которое нужно выполнить (сдать, купить, позвонить, подготовить); событие — то, что происходит в конкретный день/время (пары, работа/смена, встреча, тренировка, врач, поездка, экзамен, консультация); домашняя работа — учебное задание, явно связанное с предметом из списка пользователя. Заметка — информация, которую просят просто сохранить, а не выполнить.",
    "Если пользователь просит добавить несколько дел, создай несколько объектов. Не склеивай независимые дела в одну задачу. Если это список заданий по предмету, используй add_homework и укажи subject для каждого.",
    "ДАТЫ: относительные даты считай от сегодняшней даты. Понимай сегодня, завтра, послезавтра, через N дней, через неделю, в этот/следующий понедельник-воскресенье, к концу недели и даты 12.12 / 12.12.2026. Для задачи дата — срок выполнения (due). Для события date — день события. Не подменяй срок задачи датой события. Если дата неоднозначна, уточни. Не выдумывай год, если дата невозможна.",
    "ВРЕМЯ: используй 24-часовой HH:MM. Понимай «в семь вечера» = 19:00, «в полвосьмого» = 07:30 или 19:30 только если контекст явно указывает период, «полдвенадцатого» = 11:30, «в 12 ночи» = 00:00. Если период неясен и это важно, спроси уточнение.",
    "ИНТЕРВАЛЫ: фраза «с ... до ...» с работой, сменой, тренировкой или другим занятием означает событие, а не задачу. Всегда заполняй ОБА поля time и endTime. Пример «Работа завтра с 7 вечера до полдвенадцатого» = событие «Работа», date завтра, time 19:00, endTime 23:30. «С 9 до 11 утра» = 09:00–11:00. «С 8 вечера до 12 ночи» = 20:00–00:00. Не теряй время окончания.",
    "НЕПОЛНЫЕ ДАННЫЕ: если событию не хватает даты, выбери clarify, сохрани смысл и спроси только дату. Если домашней работе не хватает предмета, спроси предмет и перечисли варианты из контекста. Если непонятно, какую задачу/событие изменить, спроси один конкретный вопрос. Не создавай запись до получения обязательных данных.",
    "ДЕЙСТВИЯ С ЗАПИСЯМИ: «готово/сделал/выполнил» = complete; «удали/убери» = delete; «перенеси на пятницу/завтра» = reschedule; «переименуй/измени срок/сделай приоритетной» = update_task. Для домашки используй complete_homework, delete_homework, reschedule_homework и homework_query. Для событий используй delete_event, reschedule_event или update_event и event_query. Всегда заполняй task_query/event_query/homework_query фразой, которая поможет найти существующую запись. Не заявляй, что действие выполнено, если оно не было сохранено.",
    "СПИСКИ: «что сегодня/план на день» = list_today; «что завтра/какие пары в пятницу/покажи расписание на дату» = list_date и заполни due датой; «что на неделе» = list_week; «покажи задачи» = list_tasks; «какие события/встречи» = list_events; «какая домашка/что задали» = list_homework.",
    "ПРИОРИТЕТ: prio 0 высокий, 1 обычный, 2 низкий. Если приоритет не назван, ставь 1. space: study, work или personal. cat: Учёба, Работа и проекты или Другое.",
    "КОНТЕКСТ ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ (используй для распознавания названий предметов и поиска существующих записей):",
    profileContext || "Контекст пока пуст.",
    "Если не уверен, не угадывай: intent=clarify и задай один короткий вопрос. JSON-ключи должны быть на английском, значения на языке пользователя. Не добавляй вымышленные поля."
  ].join("\n");
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
    if (String(error).includes("MYDAY_AI_DAILY_LIMIT")) { console.warn("MYDAY AI quota exhausted; using deterministic text fallback."); return null; }
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
async function vision(fileId: string, userId: number, today: string, subjectNames: string[] = []) {
  if (!Deno.env.get("GROQ_API_KEY")) return "";
  if (!await consumeAiQuota(userId, today)) throw new Error("MYDAY_AI_DAILY_LIMIT");
  const { blob } = await telegramFile(fileId);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  const dataUrl = "data:" + (blob.type || "image/jpeg") + ";base64," + btoa(binary);
  const visionPrompt = "Сегодня " + today + ". Разбери изображение для планировщика MYDAY. Доступные предметы пользователя: " + (subjectNames.join("; ") || "не указаны") + ". Верни только JSON со структурой {tasks:[{title,desc,space,cat,due,prio}],homework:[{subject,title,desc,due}],events:[{title,date,time,endTime,type}],raw_text}. Извлекай только то, что действительно читается. Домашние задания связывай с предметами из списка, если совпадение уверенное. Сроки и даты записывай в YYYY-MM-DD только если они явно указаны и однозначны; иначе оставляй пусто. Для событий извлекай начало и конец времени отдельно. Не выдумывай нечитаемый текст, предметы или даты.";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY")!, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("GROQ_VISION_MODEL") || "qwen/qwen3.8-27b", response_format: { type: "json_object" }, messages: [{ role: "system", content: visionPrompt }, { role: "user", content: [{ type: "text", text: "Разбери фото: выдели домашние задания, обычные задачи и события для MYDAY." }, { type: "image_url", image_url: { url: dataUrl } }] }] }) });
  if (!r.ok) throw new Error("Не удалось разобрать фото: " + r.status);
  const d = await r.json(); try { return JSON.parse(d.choices?.[0]?.message?.content || "{}"); } catch { return ""; }
}
function dateWeekStart(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function isoWeekNumber(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function studyWeekType(data: AnyRecord, date: string) {
  const settings = data.settings || {};
  const anchor = settings.weekAnchor || dateWeekStart(isoToday(settings.timezone || TZ));
  const base = settings.weekAnchorType || (((isoWeekNumber(isoToday(settings.timezone || TZ)) + Number(settings.shift || 0)) % 2) === 1 ? "odd" : "even");
  const weeks = Math.floor((Date.parse(dateWeekStart(date) + "T12:00:00Z") - Date.parse(dateWeekStart(anchor) + "T12:00:00Z")) / 604800000);
  return (((base === "odd" ? 0 : 1) + weeks % 2 + 2) % 2) === 0 ? "odd" : "even";
}
function scheduleItemsForDate(data: AnyRecord, date: string) {
  const sched = data.sched || {};
  const cfg = data.scheduleConfig || {};
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  const mode = cfg.studyMode || "alternating";
  let study: AnyRecord[] = [];
  if (mode === "fixed") study = [...((sched.fixed || {})[day] || [])];
  else if (mode === "dates") { const specific = (sched.dates || {})[date] || {}; study = [...(specific[day] || [])]; }
  else if (mode === "cycle") {
    const n = Math.max(2, Math.min(4, Number(cfg.cycleWeeks) || 2));
    const anchor = dateWeekStart(cfg.cycleAnchor || data.settings?.weekAnchor || isoToday(data.settings?.timezone || TZ));
    const weeks = Math.floor((Date.parse(dateWeekStart(date) + "T12:00:00Z") - Date.parse(anchor + "T12:00:00Z")) / 604800000);
    const index = ((weeks % n) + n) % n;
    study = [...(((sched.cycle || {})[index] || {})[day] || [])];
  } else if (mode === "hybrid") {
    const type = studyWeekType(data, date);
    study = [...((sched.fixed || {})[day] || []), ...((sched[type] || {})[day] || [])];
  } else {
    const type = studyWeekType(data, date);
    study = [...((sched[type] || {})[day] || [])];
  }
  const exceptions = (Array.isArray(data.exc) ? data.exc : []).filter((x: AnyRecord) => x.date === date);
  for (const ex of exceptions) {
    if (ex.type === "cancel") study = study.filter((x: AnyRecord) => String(x.id) !== String(ex.lid));
    else if (ex.type === "edit") study = study.map((x: AnyRecord) => String(x.id) === String(ex.lid) ? { ...x, ...(ex.o || {}) } : x);
    else if (ex.type === "add" && ex.o) study.push({ id: ex.id, ...ex.o });
  }
  study.sort((a: AnyRecord, b: AnyRecord) => String(a.s || "").localeCompare(String(b.s || "")));
  const workConfig = data.workConfig || {};
  let work: AnyRecord[] = [];
  if (workConfig.mode === "rotation") {
    const exception = (workConfig.exceptions || {})[date];
    if (exception && exception.off === false) work = [{ subj: exception.title || workConfig.title || "Рабочая смена", s: exception.start || workConfig.start || "09:00", e: exception.end || workConfig.end || "18:00" }];
    else if (exception !== "off" && !(exception && exception.off === true)) {
      const pattern = Array.isArray(workConfig.pattern) && workConfig.pattern.length ? workConfig.pattern : ["work", "work", "off", "off"];
      const anchor = workConfig.anchorDate || isoToday(data.settings?.timezone || TZ);
      const days = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(anchor + "T12:00:00Z")) / 86400000);
      const item = pattern[((days % pattern.length) + pattern.length) % pattern.length];
      const isWork = item === "work" || item === 1 || item === "1" || (item && typeof item === "object" && item.type === "work");
      if (isWork) {
        const obj = item && typeof item === "object" ? item : {};
        work = [{ subj: obj.title || workConfig.title || "Рабочая смена", s: obj.start || workConfig.start || "09:00", e: obj.end || workConfig.end || "18:00" }];
      }
    }
  } else work = [...((sched.work || {})[day] || [])];
  work.sort((a: AnyRecord, b: AnyRecord) => String(a.s || "").localeCompare(String(b.s || "")));
  return [
    ...study.map((x: AnyRecord) => ({ kind: "Учёба", title: String(x.subj || "Занятие"), start: String(x.s || ""), end: String(x.e || ""), room: String(x.room || "") })),
    ...work.map((x: AnyRecord) => ({ kind: "Работа", title: String(x.subj || workConfig.title || "Рабочая смена"), start: String(x.s || ""), end: String(x.e || ""), room: String(x.room || "") }))
  ];
}
function guessEventTitle(text: string) {
  if (/работ|смен/i.test(text)) return "Работа";
  if (/тренировк/i.test(text)) return "Тренировка";
  if (/встреч/i.test(text)) return "Встреча";
  if (/экзамен/i.test(text)) return "Экзамен";
  if (/зач[её]т/i.test(text)) return "Зачёт";
  if (/врач|при[её]м/i.test(text)) return "Приём";
  if (/день рождения/i.test(text)) return "День рождения";
  if (/пар[а-я]*|занят[а-я]*/i.test(text)) return "Занятие";
  if (/поезд|вылет/i.test(text)) return "Поездка";
  return "Событие";
}
function taskKeyboard(tasks: Array<[string, string]>) { return tasks.map(([id, title]) => [{ text: "✓ " + String(title).slice(0, 28), callback_data: "done:" + id }, { text: "Завтра", callback_data: "tomorrow:" + id }, { text: "Удалить", callback_data: "delete:" + id }]); }
async function handleText(chatId: number, userId: number, text: string) {
  failureStage = "разбор команды";
  let cmd = text.trim();
  if (!cmd) return;
  if (/^\/(start|help)(\s|$)/i.test(cmd)) {
    await send(chatId, "Привет! Я <b>MYDAY Assistant</b> — твой личный планировщик. Пиши как человеку, не нужно запоминать команды.\n\nПримеры:\n• «Сдать лабораторную по теплотехнике до пятницы»\n• «Завтра работа с 19:00 до 23:30»\n• «Запиши домашку по теплотехнике: решить задачу»\n• «Перенеси курсовую на понедельник»\n• «Что у меня сегодня?»\n• «Какие пары завтра?»\n• «Покажи расписание на следующую пятницу»\n• «Отметь лабораторную выполненной»\n• «Запомни: преподаватель перенёс пару»\n\nКоманды: /today, /tomorrow, /day дата, /week, /tasks, /events, /homework, /app, /help", [[{ text: "Сегодня", callback_data: "view:today" }, { text: "Мои задачи", callback_data: "view:tasks" }], [{ text: "Открыть MYDAY", web_app: { url: "https://dgworkingww-cpu.github.io/myday/" } }]]);
    return;
  }
  const p = await getProfile(userId);
  const today = isoToday(p.data.settings?.timezone || TZ);
  if (/^\/app\b/i.test(cmd)) { await send(chatId, "Открыть приложение:", [[{ text: "Запустить MYDAY", web_app: { url: "https://dgworkingww-cpu.github.io/myday/" } }]]); return; }

  // Keep the meaning of a clarification across messages, e.g. "Работа с 19 до 23:30" -> "завтра".
  const pending = p.data.botState?.pending;
  if (pending?.kind === "event_date" || pending?.kind === "homework_subject") {
    const age = Date.now() - Number(pending.createdAt || 0);
    if (age < 12 * 60 * 60 * 1000 && isCancellation(cmd)) {
      p.data.botState = { pending: null };
      await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Отменил незавершённую запись. Ничего не добавлял.");
      return;
    }
    const subjectNamesForReply = (Array.isArray(p.data.subjects) ? p.data.subjects : []).filter((x: AnyRecord) => !x.closed).map((x: AnyRecord) => String(x.name || "").toLocaleLowerCase("ru"));
    const replyLower = cmd.toLocaleLowerCase("ru");
    const subjectReply = subjectNamesForReply.length
      ? subjectNamesForReply.some((name: string) => name.includes(replyLower) || replyLower.includes(name) || name.split(/\s+/).some((word: string) => word.length > 4 && replyLower.includes(word.slice(0, Math.min(7, word.length)))))
      : (!/^\//.test(cmd) && cmd.length <= 80);
    const isFollowUp = pending.kind === "event_date" ? isDateOnlyReply(cmd) : subjectReply;
    if (age < 12 * 60 * 60 * 1000 && isFollowUp) {
      if (pending.kind === "event_date") cmd = String(pending.raw || "") + " " + cmd;
      else cmd = String(pending.raw || "") + (/^по\s+/i.test(cmd) ? " " : " по ") + cmd;
      p.data.botState = { pending: null };
      await saveProfile(userId, p.data, p.baseData);
    } else if (age >= 12 * 60 * 60 * 1000 || !isFollowUp) {
      p.data.botState = { pending: null };
      await saveProfile(userId, p.data, p.baseData);
    }
  }

  if (/^\/(today|tomorrow|day|week|tasks|events|homework)\b/i.test(cmd)) {
    const mode = cmd.match(/^\/(\w+)/)![1];
    const openTasks = (Array.isArray(p.data.tasks) ? p.data.tasks : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2);
    const openHw = (Array.isArray(p.data.hw) ? p.data.hw : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2);
    const dayArg = cmd.replace(/^\/day\s*/i, "").trim();
    const planDate = mode === "tomorrow" ? shiftDate(today, 1) : mode === "day" ? (validDate(dayArg) ? dayArg : inferDate("на " + dayArg, today)) : today;
    if (mode === "day" && !planDate) { await send(chatId, "На какой день показать расписание? Например: /day завтра или /day 2026-12-04."); return; }
    const singleDay = mode === "today" || mode === "tomorrow" || mode === "day";
    const rangeStart = singleDay ? planDate : today;
    const end = singleDay ? rangeStart : shiftDate(today, 7);
    if (mode === "homework") {
      const subjects = Array.isArray(p.data.subjects) ? p.data.subjects : [];
      const lines = openHw.slice(0, 30).map((x: AnyRecord, i: number) => {
        const subject = subjects.find((s: AnyRecord) => String(s.id) === String(x.subj));
        return (i + 1) + ". <b>" + escapeHtml(x.title) + "</b>" + (subject ? " · " + escapeHtml(subject.name) : "") + (x.due ? " · до " + x.due : "");
      });
      await send(chatId, lines.length ? "<b>Невыполненная домашняя работа</b>\n" + lines.join("\n") : "Домашних заданий пока нет. Либо ты всё сделал, либо преподаватели взяли выходной.");
      return;
    }
    if (mode === "events") {
      const events = (Array.isArray(p.data.events) ? p.data.events : []).filter((x: AnyRecord) => x.date >= today).sort((a: AnyRecord, b: AnyRecord) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));
      const lines = events.slice(0, 30).map((x: AnyRecord) => "📌 <b>" + escapeHtml(x.title) + "</b> · " + x.date + (x.time ? " · " + x.time + (x.endTime ? "–" + x.endTime : "") : ""));
      await send(chatId, lines.length ? "<b>Предстоящие события</b>\n" + lines.join("\n") : "Предстоящих событий нет.");
      return;
    }
    const list = singleDay ? openTasks.filter((x: AnyRecord) => !x.due || x.due <= rangeStart) : mode === "week" ? openTasks.filter((x: AnyRecord) => !x.due || x.due <= end) : openTasks;
    const homeworkDue = singleDay ? openHw.filter((x: AnyRecord) => x.due && x.due <= rangeStart) : mode === "week" ? openHw.filter((x: AnyRecord) => x.due && x.due <= end) : [];
    const events = mode === "tasks" ? [] : (Array.isArray(p.data.events) ? p.data.events : []).filter((x: AnyRecord) => x.date >= rangeStart && x.date <= end).sort((a: AnyRecord, b: AnyRecord) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));
    const scheduleLines: string[] = [];
    if (singleDay || mode === "week") {
      const days = singleDay ? 1 : 7;
      const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
      for (let offset = 0; offset < days; offset++) {
        const date = shiftDate(rangeStart, offset);
        for (const item of scheduleItemsForDate(p.data, date)) {
          scheduleLines.push("🕘 " + date + " · " + weekdayFmt.format(new Date(date + "T12:00:00Z")) + " · " + item.kind + ": " + escapeHtml(item.title) + (item.start ? " · " + item.start + (item.end ? "–" + item.end : "") : "") + (item.room ? " · " + escapeHtml(item.room) : ""));
        }
      }
    }
    const label = mode === "today" ? "План на сегодня" : mode === "tomorrow" ? "План на завтра" : mode === "day" ? "План на " + rangeStart : mode === "week" ? "План на ближайшие 7 дней" : "Все открытые задачи";
    if (!list.length && !homeworkDue.length && !events.length && !scheduleLines.length) { await send(chatId, label + ": пока пусто."); return; }
    const taskLines = list.slice(0, 20).map((x: AnyRecord, i: number) => (i + 1) + ". " + escapeHtml(x.title) + (x.due ? " · срок " + x.due : ""));
    const homeworkLines = homeworkDue.slice(0, 15).map((x: AnyRecord) => "📚 " + escapeHtml(x.title) + (x.due ? " · срок " + x.due : ""));
    const eventLines = events.slice(0, 15).map((x: AnyRecord) => "📌 " + escapeHtml(x.title) + " · " + x.date + (x.time ? " · " + x.time + (x.endTime ? "–" + x.endTime : "") : ""));
    const sections = [...scheduleLines, ...taskLines, ...homeworkLines, ...eventLines];
    await send(chatId, "<b>" + label + "</b>\n" + sections.join("\n"), taskKeyboard(list.slice(0, 8).map((x: AnyRecord): [string, string] => [String(x.id), String(x.title)])));
    return;
  }
  if (/^\/done\s+/i.test(cmd)) {
    const id = cmd.replace(/^\/done\s+/i, "").trim();
    const t = (p.data.tasks || []).find((x: AnyRecord) => String(x.id) === id);
    if (!t) { await send(chatId, "Не нашёл такую задачу."); return; }
    t.status = 2; await saveProfile(userId, p.data, p.baseData); await send(chatId, "✓ Отметил выполненной: <b>" + escapeHtml(t.title) + "</b>."); return;
  }

  const timeRange = inferTimeRange(cmd);
  const hasSpokenTimeRange = !!timeRange;
  const eventLike = /тренировк|встреч|при[её]м|врач|экзамен|зач[её]т|консультац|день рождения|собеседован|мероприят|смен|пар[а-я]*|занят[а-я]*|поездк|вылет|приход|уход/i.test(cmd) || (/работ[а-я]*/i.test(cmd) && (hasSpokenTimeRange || /(?:в|к)\s*\d{1,2}(?::|\.)?/.test(cmd)));
  const fallbackSpace = guessSpace(cmd);
  const subjects = (Array.isArray(p.data.subjects) ? p.data.subjects : []).filter((x: AnyRecord) => !x.closed).map((x: AnyRecord) => String(x.name || "")).filter(Boolean);
  const openTaskNames = (Array.isArray(p.data.tasks) ? p.data.tasks : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2).slice(0, 60).map((x: AnyRecord) => String(x.title || ""));
  const openHomeworkNames = (Array.isArray(p.data.hw) ? p.data.hw : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2).slice(0, 60).map((x: AnyRecord) => {
    const subject = (p.data.subjects || []).find((v: AnyRecord) => String(v.id) === String(x.subj));
    return (subject ? String(subject.name) + ": " : "") + String(x.title || "");
  });
  const upcomingEvents = (Array.isArray(p.data.events) ? p.data.events : []).filter((x: AnyRecord) => x.date >= today).slice(0, 30).map((x: AnyRecord) => String(x.title || "") + " (" + x.date + ")");
  const upcomingSchedule = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(today, i);
    return scheduleItemsForDate(p.data, date).map((x: AnyRecord) => date + " " + x.kind + ": " + x.title + " " + x.start + (x.end ? "–" + x.end : ""));
  }).flat().slice(0, 60);
  const profileContext = "Предметы: " + (subjects.join("; ") || "не указаны") + "\nОткрытые задачи: " + (openTaskNames.join("; ") || "нет") + "\nДомашняя работа: " + (openHomeworkNames.join("; ") || "нет") + "\nПредстоящие события: " + (upcomingEvents.join("; ") || "нет") + "\nРасписание учёбы и работы на 7 дней: " + (upcomingSchedule.join("; ") || "не заполнено");
  const fallbackSubject = subjects.find((name: string) => {
    const normalized = name.toLocaleLowerCase("ru");
    const textLower = cmd.toLocaleLowerCase("ru");
    return textLower.includes(normalized) || normalized.split(/\s+/).some((word: string) => word.length > 5 && textLower.includes(word.slice(0, 7)));
  });
  const fallbackHomework = !!fallbackSubject && /домашн|лаборатор|курсов|реферат|задан/i.test(cmd);
  let fallbackPayload: AnyRecord;
  if (/^(?:что у меня сегодня|что сегодня|план на сегодня)/i.test(cmd)) fallbackPayload = { intent: "list_today" };
  else if (/^(?:что у меня завтра|какие пары завтра|расписание на завтра|покажи расписание на завтра)/i.test(cmd)) fallbackPayload = { intent: "list_date", due: inferDate(cmd, today) };
  else if (/^(?:что у меня|какие пары|покажи расписание|расписание на).*(?:понедельник|вторник|среду|четверг|пятниц|суббот|воскресень)/i.test(cmd)) fallbackPayload = { intent: "list_date", due: inferDate(cmd, today) };
  else if (/^(?:что на неделе|план на неделю|покажи план на неделю|расписание на неделю)/i.test(cmd)) fallbackPayload = { intent: "list_week" };
  else if (/^(?:покажи|какие|список).*(?:задач|дел)/i.test(cmd)) fallbackPayload = { intent: "list_tasks" };
  else if (/^(?:покажи|какие|что).*(?:домашк|задали|домашняя работа)/i.test(cmd)) fallbackPayload = { intent: "list_homework" };
  else if (/^(?:покажи|какие|что).*(?:событ|встреч)/i.test(cmd)) fallbackPayload = { intent: "list_events" };
  else if (/^(?:запомни|сохрани заметку|заметка:|идея:)/i.test(cmd)) fallbackPayload = { intent: "note", note: cmd.replace(/^(?:запомни|сохрани заметку|заметка:|идея:)\s*/i, "") };
  else if (fallbackHomework) fallbackPayload = { intent: "add_homework", homework: [{ subject: fallbackSubject, title: cmd, desc: "", due: inferDate(cmd, today) }] };
  else if (eventLike || hasSpokenTimeRange) fallbackPayload = { intent: "add_event", tasks: [], events: [{ title: guessEventTitle(cmd), type: guessEventTitle(cmd), date: inferDate(cmd, today), time: timeRange?.start || inferTime(cmd), endTime: timeRange?.end || "" }] };
  else fallbackPayload = { intent: "add", tasks: [{ title: cmd, desc: "", space: fallbackSpace, cat: guessCategory(fallbackSpace), due: inferDate(cmd, today), prio: 1 }] };
  failureStage = "распознавание текста";
  const payload = await aiInterpret(cmd, today, userId, "text", profileContext) || fallbackPayload;

  // Strong deterministic guard: a clearly spoken work/shift interval is always a calendar event.
  if (hasSpokenTimeRange && eventLike && !["complete", "delete", "reschedule", "update_task", "delete_event", "reschedule_event", "list_today", "list_week", "list_tasks", "list_events", "list_homework", "note", "help"].includes(String(payload.intent))) {
    payload.intent = "add_event";
    payload.events = Array.isArray(payload.events) && payload.events.length ? payload.events : [{ title: guessEventTitle(cmd), type: guessEventTitle(cmd), date: inferDate(cmd, today), time: timeRange.start, endTime: timeRange.end }];
  }
  if ((payload.intent === "add_event" || (eventLike && (hasSpokenTimeRange || payload.intent === "clarify"))) && !inferDate(cmd, today) && !(Array.isArray(payload.events) && payload.events.some((x: AnyRecord) => validDate(x.date)))) {
    p.data.botState = { pending: { kind: "event_date", raw: cmd, createdAt: Date.now() } };
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, hasSpokenTimeRange ? "Понял: " + escapeHtml(timeRange!.start + "–" + timeRange!.end) + ". На какой день поставить? Можешь ответить просто «завтра», «в пятницу» или датой. Я сохраню интервал, повторять его не придётся." : "Событие понял. На какой день его поставить? Напиши «сегодня», «завтра», день недели или дату.");
    return;
  }
  if (payload.intent === "clarify") {
    if (/домашн|лаборатор|курсов|реферат|задан/i.test(cmd) && !/по\s+[а-яё]/i.test(cmd)) {
      p.data.botState = { pending: { kind: "homework_subject", raw: cmd, createdAt: Date.now() } };
      await saveProfile(userId, p.data, p.baseData);
      const names = subjects.length ? subjects.join("; ") : "предметы пока не добавлены в приложение";
      await send(chatId, "Сохранил смысл запроса. По какому предмету записать? Твои дисциплины: " + escapeHtml(names) + ". Можно ответить одним названием.");
      return;
    }
    if (eventLike && !inferDate(cmd, today) && (hasSpokenTimeRange || payload.intent === "clarify")) {
      p.data.botState = { pending: { kind: "event_date", raw: cmd, createdAt: Date.now() } };
      await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Запомнил интервал " + escapeHtml(timeRange!.start + "–" + timeRange!.end) + ". На какой день поставить запись? Ответь просто датой или днём недели.");
      return;
    }
    await send(chatId, escapeHtml(payload.reply || "Уточни, пожалуйста, дату или к какому разделу относится запись."));
    return;
  }
  if (payload.intent === "list_today" || payload.intent === "list_date" || payload.intent === "list_tasks" || payload.intent === "list_week" || payload.intent === "list_events" || payload.intent === "list_homework") {
    const date = validDate(payload.due) ? payload.due : inferDate(cmd, today);
    if (payload.intent === "list_date" && !date) { await send(chatId, "На какой день показать расписание? Назови дату или день недели."); return; }
    const route = payload.intent === "list_today" ? "/today" : payload.intent === "list_date" ? "/day " + date : payload.intent === "list_week" ? "/week" : payload.intent === "list_events" ? "/events" : payload.intent === "list_homework" ? "/homework" : "/tasks";
    await handleText(chatId, userId, route);
    return;
  }
  if (payload.intent === "note") {
    p.data.inbox = Array.isArray(p.data.inbox) ? p.data.inbox : [];
    p.data.inbox.unshift({ text: String(payload.note || cmd), d: today });
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Сохранил в заметки MYDAY.");
    return;
  }

  if (payload.intent === "add_homework") {
    const incomingHw = Array.isArray(payload.homework) ? payload.homework : [];
    if (!incomingHw.length) { await send(chatId, "Понял, что это домашняя работа, но не смог выделить предмет и задание. Напиши, например: «Лабораторная по теплотехнике до пятницы»."); return; }
    const availableSubjects = (Array.isArray(p.data.subjects) ? p.data.subjects : []).filter((x: AnyRecord) => !x.closed);
    const createdHw: AnyRecord[] = [];
    for (const item of incomingHw.slice(0, 10)) {
      const subjectQuery = String(item.subject || payload.subject || "").toLocaleLowerCase("ru").trim();
      const matches = availableSubjects.filter((s: AnyRecord) => subjectQuery && (String(s.name || "").toLocaleLowerCase("ru").includes(subjectQuery) || subjectQuery.includes(String(s.name || "").toLocaleLowerCase("ru"))));
      if (matches.length !== 1) {
        p.data.botState = { pending: { kind: "homework_subject", raw: cmd, createdAt: Date.now() } };
        await saveProfile(userId, p.data, p.baseData);
        await send(chatId, matches.length > 1 ? "Нашёл несколько похожих предметов: " + matches.map((s: AnyRecord) => escapeHtml(s.name)).join(", ") + ". Уточни точное название." : "Для какой дисциплины записать? Твои предметы: " + (availableSubjects.map((s: AnyRecord) => escapeHtml(s.name)).join("; ") || "список предметов пока пуст") + ". Можно ответить одним названием.");
        return;
      }
      const title = String(item.title || "").trim();
      if (!title) continue;
      const due = validDate(item.due) ? item.due : inferDate(cmd, today);
      const duplicate = (p.data.hw || []).some((x: AnyRecord) => String(x.subj) === String(matches[0].id) && String(x.title).toLocaleLowerCase("ru") === title.toLocaleLowerCase("ru") && String(x.due || "") === due);
      if (!duplicate) createdHw.push({ id: uid(), subj: matches[0].id, title: title.slice(0, 500), desc: String(item.desc || "").slice(0, 2000), due, status: 0, subs: [], photos: [] });
    }
    if (!createdHw.length) { await send(chatId, "Такая домашняя работа уже есть в MYDAY. Дубликат не создавал."); return; }
    p.data.hw = Array.isArray(p.data.hw) ? p.data.hw : [];
    p.data.hw.push(...createdHw);
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Записал домашнюю работу:\n" + createdHw.map((x: AnyRecord) => {
      const s = availableSubjects.find((v: AnyRecord) => String(v.id) === String(x.subj));
      return "• <b>" + escapeHtml(x.title) + "</b>" + (s ? " · " + escapeHtml(s.name) : "") + (x.due ? " · до " + x.due : "");
    }).join("\n"));
    return;
  }

  if (["complete", "delete", "reschedule", "update_task"].includes(String(payload.intent))) {
    const query = String(payload.task_query || "").trim().toLocaleLowerCase("ru");
    if (!query) { await send(chatId, "Какую задачу изменить? Напиши её название или часть названия."); return; }
    const candidates = (Array.isArray(p.data.tasks) ? p.data.tasks : []).filter((x: AnyRecord) => Number(x.status || 0) !== 2 && String(x.title || "").toLocaleLowerCase("ru").includes(query));
    if (!candidates.length) { await send(chatId, "Не нашёл открытую задачу по запросу «" + escapeHtml(payload.task_query) + "». Покажи список командой /tasks."); return; }
    if (candidates.length > 1) {
      await send(chatId, "Нашёл несколько похожих задач. Уточни, какую именно: " + candidates.slice(0, 8).map((x: AnyRecord) => "«" + escapeHtml(x.title) + "»").join(", "));
      return;
    }
    const task = candidates[0];
    if (payload.intent === "complete") {
      task.status = 2; await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "✓ Отметил выполненной: <b>" + escapeHtml(task.title) + "</b>."); return;
    }
    if (payload.intent === "delete") {
      await send(chatId, "Удалить задачу <b>" + escapeHtml(task.title) + "</b>?", [[{ text: "Удалить задачу", callback_data: "delete_confirm:" + task.id }, { text: "Отмена", callback_data: "delete_cancel:" + task.id }]]);
      return;
    }
    if (payload.intent === "reschedule") {
      const due = validDate(payload.due) ? payload.due : inferDate(cmd, today);
      if (!due) { await send(chatId, "На какую дату перенести «" + escapeHtml(task.title) + "»? Напиши день недели или дату."); return; }
      task.due = due; await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Перенёс <b>" + escapeHtml(task.title) + "</b> на " + due + "."); return;
    }
    if (payload.intent === "update_task") {
      if (typeof payload.title === "string" && payload.title.trim()) task.title = payload.title.trim().slice(0, 240);
      if (validDate(payload.due)) task.due = payload.due;
      if ([0, 1, 2].includes(Number(payload.prio))) task.prio = Number(payload.prio);
      await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Обновил задачу: <b>" + escapeHtml(task.title) + "</b>" + (task.due ? " · срок " + task.due : "") + ".");
      return;
    }
  }

  if (["complete_homework", "delete_homework", "reschedule_homework"].includes(String(payload.intent))) {
    const query = String(payload.homework_query || payload.task_query || "").trim().toLocaleLowerCase("ru");
    if (!query) { await send(chatId, "Какое домашнее задание изменить? Напиши его название."); return; }
    const items = Array.isArray(p.data.hw) ? p.data.hw : [];
    const candidates = items.filter((x: AnyRecord) => Number(x.status || 0) !== 2 && String(x.title || "").toLocaleLowerCase("ru").includes(query));
    if (candidates.length !== 1) { await send(chatId, candidates.length ? "Нашёл несколько похожих заданий: " + candidates.slice(0, 8).map((x: AnyRecord) => "«" + escapeHtml(x.title) + "»").join(", ") : "Не нашёл такое домашнее задание. Проверь /homework."); return; }
    const hw = candidates[0];
    if (payload.intent === "complete_homework") { hw.status = 2; await saveProfile(userId, p.data, p.baseData); await send(chatId, "✓ Отметил домашнюю работу выполненной: <b>" + escapeHtml(hw.title) + "</b>."); return; }
    if (payload.intent === "delete_homework") {
      await send(chatId, "Удалить домашнее задание <b>" + escapeHtml(hw.title) + "</b>?", [[{ text: "Удалить задание", callback_data: "homework_delete_confirm:" + hw.id }, { text: "Отмена", callback_data: "homework_delete_cancel:" + hw.id }]]);
      return;
    }
    const due = validDate(payload.due) ? payload.due : inferDate(cmd, today);
    if (!due) { await send(chatId, "На какой срок перенести «" + escapeHtml(hw.title) + "»? Напиши дату или день недели."); return; }
    hw.due = due; await saveProfile(userId, p.data, p.baseData); await send(chatId, "Перенёс домашнее задание на " + due + ": <b>" + escapeHtml(hw.title) + "</b>."); return;
  }

  if (["delete_event", "reschedule_event", "update_event"].includes(String(payload.intent))) {
    const query = String(payload.event_query || "").trim().toLocaleLowerCase("ru");
    if (!query) { await send(chatId, "Какое событие изменить? Напиши его название."); return; }
    const events = Array.isArray(p.data.events) ? p.data.events : [];
    const candidates = events.filter((x: AnyRecord) => String(x.title || "").toLocaleLowerCase("ru").includes(query));
    if (candidates.length !== 1) { await send(chatId, candidates.length ? "Нашёл несколько событий: " + candidates.slice(0, 8).map((x: AnyRecord) => "«" + escapeHtml(x.title) + "» · " + x.date).join("; ") : "Не нашёл такое событие. Проверь /events."); return; }
    const event = candidates[0];
    if (payload.intent === "delete_event") {
      await send(chatId, "Удалить событие <b>" + escapeHtml(event.title) + "</b> · " + event.date + "?", [[{ text: "Удалить событие", callback_data: "event_delete_confirm:" + event.id }, { text: "Отмена", callback_data: "event_delete_cancel:" + event.id }]]);
      return;
    }
    const date = validDate(payload.due) ? payload.due : inferDate(cmd, today);
    const hasTime = validTime(payload.time) || validTime(payload.endTime);
    if (date) event.date = date;
    if (validTime(payload.time)) event.time = payload.time;
    if (validTime(payload.endTime)) event.endTime = payload.endTime;
    if (!date && !hasTime) { await send(chatId, "Что именно изменить у события: дату или время?"); return; }
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Обновил событие <b>" + escapeHtml(event.title) + "</b> · " + event.date + (event.time ? " · " + event.time + (event.endTime ? "–" + event.endTime : "") : "") + ".");
    return;
  }

  if (payload.intent === "add_event") {
    const incomingEvents = Array.isArray(payload.events) ? payload.events : [];
    if (!incomingEvents.length) { await send(chatId, "Не смог выделить событие. Напиши, например: «Тренировка завтра в 18:00»."); return; }
    p.data.events = Array.isArray(p.data.events) ? p.data.events : [];
    const createdEvents: AnyRecord[] = [];
    for (const x of incomingEvents.slice(0, 10)) {
      const date = validDate(x.date) ? x.date : inferDate(cmd, today);
      if (!date) continue;
      const time = validTime(x.time) ? x.time : (timeRange?.start || inferTime(cmd));
      const endTime = validTime(x.endTime) ? x.endTime : (timeRange?.end || "");
      const title = String(x.title || (/работ|смен/i.test(cmd) ? "Работа" : cmd)).trim().slice(0, 240);
      const duplicate = p.data.events.some((old: AnyRecord) => String(old.title || "").toLocaleLowerCase("ru") === title.toLocaleLowerCase("ru") && old.date === date && String(old.time || "") === time && String(old.endTime || "") === endTime);
      if (!duplicate) createdEvents.push({ id: uid(), title, type: String(x.type || "Событие"), date, time, endTime });
    }
    if (!createdEvents.length) { await send(chatId, "Такая запись уже есть в календаре. Дубликат не создавал."); return; }
    p.data.events.push(...createdEvents);
    await saveProfile(userId, p.data, p.baseData);
    await send(chatId, "Добавил в календарь MYDAY:\n" + createdEvents.map((x: AnyRecord) => "📌 <b>" + escapeHtml(x.title) + "</b> · " + x.date + (x.time ? " · " + x.time + (x.endTime ? "–" + x.endTime : "") : "")).join("\n"));
    return;
  }
  if (payload.intent === "help") { await send(chatId, "Можешь свободно писать задачи, события, домашнюю работу, заметки и команды на изменение записей. Примеры: «завтра работа с 19 до 23:30», «запиши лабораторную по теплотехнике до пятницы», «перенеси тренировку на субботу», «что у меня на неделе?». Команды: /today, /tomorrow, /day дата, /week, /tasks, /events, /homework, /app."); return; }

  const incoming = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (!incoming.length) { await send(chatId, "Не понял, что сохранить. Попробуй сформулировать как действие: что нужно сделать и к какому сроку."); return; }
  p.data.tasks = Array.isArray(p.data.tasks) ? p.data.tasks : [];
  const created: AnyRecord[] = [];
  for (const raw of incoming.slice(0, 10)) {
    const title = String(raw.title || "").trim();
    if (!title) continue;
    const space = ["study", "work", "personal"].includes(raw.space) ? raw.space : guessSpace(title);
    const due = validDate(raw.due) ? raw.due : inferDate(title + " " + cmd, today);
    const duplicate = p.data.tasks.some((old: AnyRecord) => Number(old.status || 0) !== 2 && String(old.title || "").toLocaleLowerCase("ru") === title.toLocaleLowerCase("ru") && String(old.due || "") === due);
    if (!duplicate) {
      const task = { id: uid(), title: title.slice(0, 240), desc: String(raw.desc || "").slice(0, 2000), cat: String(raw.cat || guessCategory(space)), space, due, prio: [0,1,2].includes(Number(raw.prio)) ? Number(raw.prio) : 1, status: 0, subs: [], repeat: "", created: today };
      p.data.tasks.push(task); created.push(task);
    }
  }
  if (!created.length) { await send(chatId, "Такая задача уже есть в MYDAY. Повторную запись не создавал."); return; }
  await saveProfile(userId, p.data, p.baseData);
  failureStage = "отправка подтверждения в Telegram";
  const summary = created.map((x, i) => (i + 1) + ". <b>" + escapeHtml(x.title) + "</b>" + (x.due ? " · срок " + x.due : "")).join("\n");
  await send(chatId, "Сохранил в MYDAY и синхронизировал с приложением:\n" + summary, taskKeyboard(created.map((x): [string, string] => [String(x.id), String(x.title)])));
}
async function handleCallback(q: AnyRecord) {
  const userId = Number(q.from?.id), chatId = Number(q.message?.chat?.id), data = String(q.data || "");
  if (!userId || !chatId) return;
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  if (data.startsWith("view:")) { await handleText(chatId, userId, "/" + data.slice(5)); return; }
  if (q.message?.chat?.type !== "private") return;
  const p = await getProfile(userId), parts = data.split(":"), action = parts[0], id = parts.slice(1).join(":");
  if (action === "homework_delete_confirm" || action === "homework_delete_cancel") {
    const hw = (p.data.hw || []).find((x: AnyRecord) => String(x.id) === id);
    if (!hw) { await send(chatId, "Это домашнее задание уже не найдено."); return; }
    if (action === "homework_delete_confirm") {
      p.data.hw = (p.data.hw || []).filter((x: AnyRecord) => String(x.id) !== id);
      await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Удалил домашнее задание: <b>" + escapeHtml(hw.title) + "</b>.");
    } else await send(chatId, "Оставил домашнее задание без изменений.");
    return;
  }
  if (action === "event_delete_confirm" || action === "event_delete_cancel") {
    const event = (p.data.events || []).find((x: AnyRecord) => String(x.id) === id);
    if (!event) { await send(chatId, "Это событие уже не найдено."); return; }
    if (action === "event_delete_confirm") {
      p.data.events = (p.data.events || []).filter((x: AnyRecord) => String(x.id) !== id);
      await saveProfile(userId, p.data, p.baseData);
      await send(chatId, "Удалил событие: <b>" + escapeHtml(event.title) + "</b>.");
    } else await send(chatId, "Оставил событие без изменений.");
    return;
  }
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
        const voiceProfile = await getProfile(userId);
        const transcript = await transcribe(m.voice?.file_id || m.audio.file_id, userId, isoToday(voiceProfile.data.settings?.timezone || TZ));
        if (!transcript) { await send(chatId, "Голосовое получил, но распознавание пока не подключено. Для него нужен бесплатный GROQ_API_KEY в секретах проекта."); return json({ ok: true }); }
        await send(chatId, "🎙 Распознал: «" + escapeHtml(transcript) + "»\nСекунду, добавляю…");
        text = transcript;
      } else if (m.photo?.length) {
        const photoProfile = await getProfile(userId);
        const subjectNames = (Array.isArray(photoProfile.data.subjects) ? photoProfile.data.subjects : []).filter((x: AnyRecord) => !x.closed).map((x: AnyRecord) => String(x.name || "")).filter(Boolean);
        const parsed = await vision(m.photo[m.photo.length - 1].file_id, userId, isoToday(photoProfile.data.settings?.timezone || TZ), subjectNames);
        const extracted: string[] = [];
        if (Array.isArray(parsed?.homework)) extracted.push(...parsed.homework.map((x: AnyRecord) => "домашняя работа по " + String(x.subject || "") + ": " + String(x.title || "") + (x.due ? " до " + x.due : "")));
        if (Array.isArray(parsed?.tasks)) extracted.push(...parsed.tasks.map((x: AnyRecord) => String(x.title || "") + (x.due ? " до " + x.due : "")));
        if (Array.isArray(parsed?.events)) extracted.push(...parsed.events.map((x: AnyRecord) => "событие " + String(x.title || "") + (x.date ? " " + x.date : "") + (x.time ? " с " + x.time + (x.endTime ? " до " + x.endTime : "") : "")));
        if (!extracted.length) { await send(chatId, "Фото получил, но не смог уверенно прочитать задание или событие. Пришли снимок чётче или отправь текстом."); return json({ ok: true }); }
        text = extracted.join("; ");
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
      else if (!m.voice && !m.audio && !m.photo && !m.document) await send(chatId, "Напиши задачу, событие или домашнюю работу текстом либо отправь голосовое/фото. Команды: /today, /tomorrow, /day дата, /week, /tasks, /events, /homework, /app.");
    }
    return json({ ok: true });
  } catch (error) {
    console.error("MYDAY bot webhook error:", error);
    if (fallbackChatId) {
      try {
        const message = String(error).includes("MYDAY_AI_DAILY_LIMIT")
          ? "На сегодня исчерпан лимит AI-запросов MYDAY (100). Голосовые и фото временно недоступны; обычные команды и текстовые задачи продолжают работать в базовом режиме."
          : "Не получилось обработать сообщение.\nЭтап: " + failureStage + ".\nПричина: " + (error instanceof Error ? error.message : "неизвестная ошибка") + ".\nПроверь /tasks, чтобы не создать дубликат.";
        await send(fallbackChatId, message);
      } catch { /* Telegram may be temporarily unavailable */ }
    }
    return json({ ok: true });
  }
});
