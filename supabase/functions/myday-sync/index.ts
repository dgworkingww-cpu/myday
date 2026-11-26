const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes: Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validateTelegramInitData(initData: string, botToken: string): Promise<string> {
  if (!initData || initData.length > 12_000) throw new Error("Telegram initData отсутствует или слишком длинный");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error("Некорректная подпись Telegram");

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || authDate > now + 60 || now - authDate > 86_400) {
    throw new Error("Срок авторизации Telegram истёк. Закройте и заново откройте MYDAY.");
  }

  params.delete("hash");
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const secretKey = new Uint8Array(await hmac(encoder.encode(botToken), "WebAppData"));
  const calculatedHash = hex(await hmac(secretKey, checkString));
  if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) throw new Error("Не удалось подтвердить Telegram-пользователя");

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("В данных Telegram отсутствует пользователь");
  let user: { id?: number };
  try { user = JSON.parse(rawUser); } catch { throw new Error("Некорректные данные пользователя Telegram"); }
  if (!Number.isSafeInteger(user.id) || !user.id || user.id < 0) throw new Error("Некорректный Telegram ID");
  return String(user.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let serviceKey = "";
    try {
      const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      serviceKey = secretKeys.default || "";
    } catch { /* fall back to the legacy key below */ }
    if (!serviceKey) serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!botToken || !supabaseUrl || !serviceKey) return json({ error: "Сервер MYDAY не настроен: отсутствуют секреты" }, 503);

    const body = await req.json();
    const telegramId = await validateTelegramInitData(String(body.initData || ""), botToken);
    const base = supabaseUrl.replace(/\/+$/, "");
    const headers = { apikey: serviceKey, "Content-Type": "application/json" };

    if (body.action === "load") {
      const url = base + "/rest/v1/myday_profiles?telegram_id=eq." + encodeURIComponent(telegramId) + "&select=data";
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error("Ошибка чтения профиля из базы");
      const rows = await response.json();
      return json({ data: rows.length ? rows[0].data : null });
    }

    if (body.action === "save") {
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return json({ error: "Некорректные данные профиля" }, 400);
      const serialized = JSON.stringify(body.data);
      if (serialized.length > 1_000_000) return json({ error: "Размер профиля превышает 1 МБ" }, 413);
      const response = await fetch(base + "/rest/v1/myday_profiles?on_conflict=telegram_id", {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ telegram_id: telegramId, data: body.data, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("Ошибка сохранения профиля в базе");
      return json({ ok: true });
    }

    return json({ error: "Неизвестное действие" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Внутренняя ошибка сервера" }, 400);
  }
});
