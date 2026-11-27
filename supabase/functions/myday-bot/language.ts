// Deterministic Russian date/time helpers shared by the MYDAY Telegram assistant and tests.
const WEEKDAYS: Record<string, number> = {
  воскресенье: 0, воскресенья: 0, вс: 0,
  понедельник: 1, понедельника: 1, пн: 1,
  вторник: 2, вторника: 2, вт: 2,
  среда: 3, среду: 3, среды: 3, ср: 3,
  четверг: 4, четверга: 4, чт: 4,
  пятница: 5, пятницу: 5, пятницы: 5, пт: 5,
  суббота: 6, субботу: 6, субботы: 6, сб: 6,
};
const WORD_HOURS: Record<string, number> = {
  ноль: 0, нуля: 0, час: 1, часу: 1, первого: 1, первому: 1,
  два: 2, двух: 2, второго: 2, второму: 2,
  три: 3, трёх: 3, трех: 3, третьего: 3, третьему: 3,
  четыре: 4, четырёх: 4, четырех: 4, четвёртого: 4, четвертого: 4,
  пять: 5, пяти: 5, пятого: 5,
  шесть: 6, шести: 6, шестого: 6,
  семь: 7, семи: 7, седьмого: 7,
  восемь: 8, восьми: 8, восьмого: 8,
  девять: 9, девяти: 9, девятого: 9,
  десять: 10, десяти: 10, десятого: 10,
  одиннадцать: 11, одиннадцати: 11, одиннадцатого: 11,
  двенадцать: 12, двенадцати: 12, двенадцатого: 12,
};
const HALF_HOURS: Record<string, number> = {
  первого: 0, второго: 1, третьего: 2, третьему: 2,
  четвертого: 3, четвёртого: 3, пятого: 4, шестого: 5,
  седьмого: 6, восьмого: 7, девятого: 8, десятого: 9,
  одиннадцатого: 10, двенадцатого: 11,
};
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function shiftIsoDate(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function inferDate(text: string, today: string): string {
  const t = text.toLocaleLowerCase("ru").replace(/ё/g, "е");
  if (/(?:^|[^а-яё])послезавтра(?=$|[^а-яё])/.test(t)) return shiftIsoDate(today, 2);
  if (/(?:^|[^а-яё])завтра(?=$|[^а-яё])/.test(t)) return shiftIsoDate(today, 1);
  if (/(?:^|[^а-яё])сегодня(?=$|[^а-яё])/.test(t)) return today;
  const numeric = t.match(/(?:до|к|на|в|от)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? "20" + numeric[3] : numeric[3]) : Number(today.slice(0, 4));
    let candidate = year + "-" + numeric[2].padStart(2, "0") + "-" + numeric[1].padStart(2, "0");
    if (!numeric[3] && candidate < today) candidate = (year + 1) + candidate.slice(4);
    return validDate(candidate) ? candidate : "";
  }
  const inWeeks = t.match(/через\s+(\d+)\s+недел/);
  if (inWeeks) return shiftIsoDate(today, Math.min(365, Number(inWeeks[1]) * 7));
  const inDays = t.match(/через\s+(\d+)\s+д(?:ень|ня|ней)/);
  if (inDays) return shiftIsoDate(today, Math.min(365, Number(inDays[1])));
  if (/через\s+недел/.test(t)) return shiftIsoDate(today, 7);

  const dayMatch = t.match(/(?:^|[^а-яё])(в|на|к|до)\s+(?:(следующ(?:ий|ую|ем|его)|эту|этот)\s+)?(понедельник|вторник|среду?|четверг|пятниц(?:у|а)|субботу?|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?=$|[^а-яё])/);
  if (dayMatch) {
    const dayToken = dayMatch[3];
    const qualifier = dayMatch[2] || "";
    const key = dayToken === "среду" ? "среда" : dayToken === "пятницу" ? "пятница" : dayToken === "субботу" ? "суббота" : dayToken;
    const target = WEEKDAYS[key];
    if (target !== undefined) {
      const current = new Date(today + "T12:00:00Z").getUTCDay();
      let delta = (target - current + 7) % 7;
      const nextWeek = /следующ(?:ей|ую)\s+недел/.test(t);
      if (/^следующ/.test(qualifier) || nextWeek || (delta === 0 && !/^эту|^этот/.test(qualifier))) delta += 7;
      return shiftIsoDate(today, delta);
    }
  }
  if (/начал(?:е|а)\s+следующ(?:ей|ую)\s+недел/.test(t)) {
    const current = new Date(today + "T12:00:00Z").getUTCDay();
    return shiftIsoDate(today, ((1 - current + 7) % 7) || 7);
  }
  if (/выходн|к\s+выходным/.test(t)) {
    const current = new Date(today + "T12:00:00Z").getUTCDay();
    return shiftIsoDate(today, ((6 - current + 7) % 7) || 7);
  }
  if (/конц(?:е|а)\s+недел|к\s+концу\s+недели/.test(t)) {
    const current = new Date(today + "T12:00:00Z").getUTCDay();
    return shiftIsoDate(today, ((5 - current + 7) % 7) || 7);
  }
  return "";
}
export function parseClock(text: string): string {
  const t = text.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
  if (/полночь|полуночи/.test(t)) return "00:00";\n  if (/полдень|полудня/.test(t)) return "12:00";\n  const half = t.match(/пол(?:овин[аы])?\s*(первого|второго|третьего|четвертого|четвёртого|пятого|шестого|седьмого|восьмого|девятого|десятого|одиннадцатого|двенадцатого)/);
  if (half) {
    let hour = HALF_HOURS[half[1]];
    if ((/вечера|ночи/.test(t)) && hour < 12) hour += 12;
    return String(hour).padStart(2, "0") + ":30";
  }
  const numeric = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(утра|дня|вечера|ночи)?/);
  if (numeric) {
    let hour = Number(numeric[1]);
    const minute = Number(numeric[2] || 0);
    if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return "";
    const period = numeric[3];
    if (period === "вечера" && hour < 12) hour += 12;
    else if (period === "утра" && hour === 12) hour = 0;
    else if (period === "ночи" && hour === 12) hour = 0;
    else if (period === "дня" && hour < 12) hour += 12;
    if (hour === 24) hour = 0;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }
  const word = t.match(/(?:^|[^а-яё])(одиннадцать|двенадцать|десять|девять|восемь|семь|шесть|пять|четыре|три|два|час|один|одного|двух|трех|трёх|четырех|четырёх|пяти|шести|семи|восьми|девяти|десяти|одиннадцати|двенадцати)(?=$|[^а-яё])/);
  if (word) {
    const map: Record<string, number> = { одиннадцать: 11, двенадцать: 12, десять: 10, девять: 9, восемь: 8, семь: 7, шесть: 6, пять: 5, четыре: 4, три: 3, два: 2, час: 1, один: 1, одного: 1, двух: 2, трех: 3, трёх: 3, четырех: 4, четвёртых: 4, пяти: 5, шести: 6, семи: 7, восьми: 8, девяти: 9, десяти: 10, одиннадцати: 11, двенадцати: 12 };
    let hour = map[word[1]];
    if (/вечера/.test(t) && hour < 12) hour += 12;
    if (/ночи|утра/.test(t) && hour === 12) hour = 0;
    if (/дня/.test(t) && hour < 12) hour += 12;
    return String(hour).padStart(2, "0") + ":00";
  }
  return "";
}
export function inferTime(text: string): string {
  const m = text.toLocaleLowerCase("ru").match(/(?:в|к|на|с)\s*((?:\d{1,2}(?:[:.]\d{2})?\s*(?:утра|дня|вечера|ночи)?)|(?:пол(?:овина)?\s*[а-яе]+)|(?:[а-яе]+\s*(?:утра|дня|вечера|ночи)))/i);
  return m ? parseClock(m[1]) : "";
}
export function inferTimeRange(text: string): { start: string; end: string } | null {
  const m = text.toLocaleLowerCase("ru").match(/(?:^|[^а-яё])с\s+(.+?)\s+(?:до|по)\s+(.+?)(?=$|[,;.])/i);
  if (!m) return null;
  const start = parseClock(m[1]);
  let end = parseClock(m[2]);
  if (!start || !end) return null;
  const startHour = Number(start.slice(0, 2));
  const endHour = Number(end.slice(0, 2));
  // In an evening shift, an unqualified spoken half-hour such as "полдвенадцатого"
  // normally means 23:30, not 11:30. Explicit "утра/ночи" remains authoritative.
  if (startHour >= 18 && endHour > 0 && endHour < 12 && !/утра|ночи/.test(m[2])) {
    end = String(endHour + 12).padStart(2, "0") + end.slice(2);
  }
  return { start, end };
}
export function isDateOnlyReply(text: string): boolean {
  const t = text.toLocaleLowerCase("ru").trim().replace(/[.!?]+$/, "");
  return /^(?:сегодня|завтра|послезавтра|через\s+неделю|через\s+\d+\s+д(?:ень|ня|ней)|(?:в|на|к|до)\s+(?:следующ(?:ий|ую|ем|его)\s+)?(?:понедельник|вторник|среду?|четверг|пятниц(?:у|а)|субботу?|воскресенье|пн|вт|ср|чт|пт|сб|вс)|(?:на\s+)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)$/i.test(t);
}
export function isCancellation(text: string): boolean {
  return /^(?:отмена|отмени|не надо|забудь|стоп|нет|не добавляй)[.! ]*$/i.test(text.trim());
}
