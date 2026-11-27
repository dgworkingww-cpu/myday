export type ProfileRecord = Record<string, any>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function isRecord(value: unknown): value is ProfileRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function itemKey(value: unknown, path: string): string {
  if (!isRecord(value)) return "";
  if (path === "exc" || path.endsWith(".exc")) {
    const date = String(value.date || "");
    const key = String(value.lid || value.id || "");
    return date && key ? date + ":" + key : "";
  }
  return value.id == null || value.id === "" ? "" : String(value.id);
}

function mergeArray(latest: unknown[], incoming: unknown[], base: unknown[], path: string): unknown[] {
  if (path === "inbox" || path.endsWith(".inbox")) {
    const additions = incoming.filter((item) =>
      !base.some((old) => same(old, item)) && !latest.some((old) => same(old, item))
    );
    return [...additions, ...latest].slice(0, 300);
  }

  const all = [...latest, ...incoming, ...base];
  const keyed = all.length > 0 && all.every((item) => !!itemKey(item, path));
  if (!keyed) return incoming;

  const result = [...latest];
  const baseByKey = new Map(base.map((item) => [itemKey(item, path), item]));
  const incomingByKey = new Map(incoming.map((item) => [itemKey(item, path), item]));
  const latestByKey = new Map(latest.map((item) => [itemKey(item, path), item]));

  // Apply deletions only if the latest value was not independently changed.
  for (const [key, baseItem] of baseByKey) {
    if (incomingByKey.has(key)) continue;
    const latestItem = latestByKey.get(key);
    if (latestItem !== undefined && same(latestItem, baseItem)) {
      const index = result.findIndex((item) => itemKey(item, path) === key);
      if (index >= 0) result.splice(index, 1);
    }
  }

  // Merge changed records by identity, preserving unrelated concurrent edits.
  for (const item of incoming) {
    const key = itemKey(item, path);
    const baseItem = baseByKey.get(key);
    const latestItem = latestByKey.get(key);
    if (baseItem === undefined) {
      if (latestItem === undefined) result.push(item);
      continue;
    }
    if (latestItem === undefined) {
      result.push(item);
      continue;
    }
    const merged = mergeValue(latestItem, item, baseItem, path + "[]");
    const index = result.findIndex((entry) => itemKey(entry, path) === key);
    if (index >= 0) result[index] = merged;
  }
  return result;
}

function mergeValue(latest: any, incoming: any, base: any, path: string): any {
  if (same(incoming, base)) return latest;
  if (same(latest, base)) return incoming;

  if (Array.isArray(latest) && Array.isArray(incoming) && Array.isArray(base)) {
    return mergeArray(latest, incoming, base, path);
  }

  if (isRecord(latest) && isRecord(incoming) && isRecord(base)) {
    const merged: ProfileRecord = { ...latest };
    const keys = new Set([...Object.keys(latest), ...Object.keys(incoming), ...Object.keys(base)]);
    for (const key of keys) {
      const before = base[key];
      const next = incoming[key];
      const current = latest[key];
      if (!(key in incoming)) {
        if (key in base && same(current, before)) delete merged[key];
        continue;
      }
      if (!(key in base)) {
        if (!(key in latest)) merged[key] = next;
        else if (!same(current, next)) merged[key] = mergeValue(current, next, undefined, path ? path + "." + key : key);
        continue;
      }
      merged[key] = mergeValue(current, next, before, path ? path + "." + key : key);
    }
    return merged;
  }

  // For scalar values and non-identity arrays, the bot's explicit change wins.
  return incoming;
}

export function mergeProfileChanges(latest: ProfileRecord, incoming: ProfileRecord, base: ProfileRecord): ProfileRecord {
  return mergeValue(latest || {}, incoming || {}, base || {}, "") as ProfileRecord;
}
