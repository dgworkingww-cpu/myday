import { mergeProfileChanges } from "../supabase/functions/myday-bot/profile-merge.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

Deno.test("bot schedule lesson additions survive concurrent profile changes", () => {
  const base = {
    sched: { odd: { 1: [{ id: "old", title: "Математика" }] }, even: {} },
    exc: [],
    tasks: []
  };
  const incoming = structuredClone(base);
  incoming.exc.push({ date: "2026-11-28", id: "new-lesson", type: "add", o: { subj: "Теплотехника", s: "11:00", e: "12:30" } });
  const latest = structuredClone(base);
  latest.sched.odd[2] = [{ id: "concurrent", title: "Физика" }];

  const merged = mergeProfileChanges(latest, incoming, base);
  assertEquals(merged.exc.length, 1);
  assertEquals(merged.exc[0].o.subj, "Теплотехника");
  assertEquals(merged.sched.odd[2][0].id, "concurrent");
  assertEquals(merged.sched.odd[1][0].id, "old");
});

Deno.test("schedule imports in sched are persisted instead of silently discarded", () => {
  const base = { sched: { odd: { 1: [] }, even: {} }, scheduleConfig: { studyMode: "alternating" } };
  const incoming = structuredClone(base);
  incoming.sched.odd[1].push({ id: "lesson-1", subj: "Теплотехника", s: "11:00", e: "12:30" });
  const latest = structuredClone(base);
  latest.scheduleConfig.studyMode = "fixed";

  const merged = mergeProfileChanges(latest, incoming, base);
  assertEquals(merged.sched.odd[1].length, 1);
  assertEquals(merged.sched.odd[1][0].id, "lesson-1");
  assertEquals(merged.scheduleConfig.studyMode, "fixed");
});

Deno.test("concurrent task additions and bot task updates are both retained", () => {
  const base = { tasks: [{ id: "a", title: "Старая задача", status: 0 }] };
  const incoming = { tasks: [{ id: "a", title: "Обновлённая задача", status: 0 }] };
  const latest = { tasks: [...base.tasks, { id: "b", title: "Задача из приложения", status: 0 }] };
  const merged = mergeProfileChanges(latest, incoming, base);
  assertEquals(merged.tasks.map((x: any) => x.title), ["Обновлённая задача", "Задача из приложения"]);
});

Deno.test("bot deletions apply without deleting a record changed concurrently", () => {
  const base = { events: [{ id: "a", title: "Удалить", date: "2026-12-01" }, { id: "b", title: "Оставить", date: "2026-12-02" }] };
  const incoming = { events: [{ id: "b", title: "Оставить", date: "2026-12-02" }] };
  const latest = { events: [{ id: "a", title: "Параллельное изменение", date: "2026-12-01" }, ...base.events.slice(1)] };
  const merged = mergeProfileChanges(latest, incoming, base);
  assertEquals(merged.events.length, 2);
  assertEquals(merged.events[0].title, "Параллельное изменение");
});

Deno.test("inbox notes are merged without overwriting concurrent notes", () => {
  const base = { inbox: [{ text: "Старая заметка", d: "2026-11-27" }] };
  const incoming = { inbox: [...base.inbox, { text: "Из бота", d: "2026-11-27" }] };
  const latest = { inbox: [...base.inbox, { text: "Из приложения", d: "2026-11-27" }] };
  const merged = mergeProfileChanges(latest, incoming, base);
  assertEquals(merged.inbox.map((x: any) => x.text), ["Из бота", "Старая заметка", "Из приложения"]);
});
