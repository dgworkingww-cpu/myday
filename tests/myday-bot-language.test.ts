import { assertEquals } from "jsr:@std/assert";
import { inferDate, inferTimeRange, parseClock, isDateOnlyReply, isCancellation, validDate } from "../supabase/functions/myday-bot/language.ts";

Deno.test("relative Russian dates resolve from the supplied local date", () => {
  assertEquals(inferDate("сегодня", "2026-11-27"), "2026-11-27");
  assertEquals(inferDate("завтра", "2026-11-27"), "2026-11-28");
  assertEquals(inferDate("послезавтра", "2026-11-27"), "2026-11-29");
  assertEquals(inferDate("через 3 дня", "2026-11-27"), "2026-11-30");
  assertEquals(inferDate("в следующую пятницу", "2026-11-27"), "2026-12-04");
});

Deno.test("numeric dates are validated instead of silently accepted", () => {
  assertEquals(inferDate("сдать к 12.12", "2026-11-27"), "2026-12-12");
  assertEquals(inferDate("сдать к 31.02", "2026-11-27"), "");
  assertEquals(validDate("2026-12-12"), true);
  assertEquals(validDate("2026-02-31"), false);
});

Deno.test("spoken Russian time ranges preserve both endpoints", () => {
  assertEquals(inferTimeRange("Работа завтра с 7 вечера до полдвенадцатого"), { start: "19:00", end: "11:30" });
  assertEquals(inferTimeRange("Тренировка с 9 до 11 утра"), { start: "09:00", end: "11:00" });
  assertEquals(inferTimeRange("Смена с 8 вечера до 12 ночи"), { start: "20:00", end: "00:00" });
});

Deno.test("spoken half-hours and time-only follow-ups are recognized", () => {
  assertEquals(parseClock("полвосьмого"), "07:30");
  assertEquals(parseClock("полдвенадцатого"), "11:30");
  assertEquals(isDateOnlyReply("завтра"), true);
  assertEquals(isDateOnlyReply("в пятницу"), true);
  assertEquals(isDateOnlyReply("12.12"), true);
  assertEquals(isCancellation("отмена"), true);
});
