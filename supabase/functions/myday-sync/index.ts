const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 1_100_000;

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
  const keys = Array.from(params.keys());
  if (new Set(keys).size !== keys.length) throw new Error("Некорректные данные Telegram");
  const receivedHash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error("Некорректная подпись Telegram");

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || !authDate || authDate > now + 60 || now - authDate > 86_400) {
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
    const length = Number(req.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) return json({ error: "Запрос слишком большой" }, 413);
    const rawBody = await req.text();
    if (encoder.encode(rawBody).length > MAX_BODY_BYTES) return json({ error: "Запрос слишком большой" }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    } catch {
      return json({ error: "Некорректный JSON" }, 400);
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let serviceKey = "";
    try {
      const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      serviceKey = secretKeys.default || "";
    } catch { /* fall back to the legacy key below */ }
    if (!serviceKey) serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!botToken || !supabaseUrl || !serviceKey) return json({ error: "Сервер MYDAY не настроен: отсутствуют секреты" }, 503);

    const telegramId = await validateTelegramInitData(String(body.initData || ""), botToken);
    const base = supabaseUrl.replace(/\/+$/, "");
    const headers = { apikey: serviceKey, "Content-Type": "application/json" };

    if (body.action === "load") {
      const url = base + "/rest/v1/myday_profiles?telegram_id=eq." + encodeURIComponent(telegramId) + "&select=data,revision";
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.error("MYDAY profile load failed:", response.status, await response.text());
        return json({ error: "Не удалось загрузить профиль из облака" }, 502);
      }
      const rows = await response.json();
      return json({ data: rows.length ? rows[0].data : null, revision: rows.length ? Number(rows[0].revision) : 0 });
    }

    if (body.action === "save") {
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return json({ error: "Некорректные данные профиля" }, 400);
      const serialized = JSON.stringify(body.data);
      if (encoder.encode(serialized).length > 1_000_000) return json({ error: "Размер профиля превышает 1 МБ" }, 413);
      const expectedRevision = Number(body.expectedRevision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return json({ error: "Некорректная версия профиля" }, 400);

      const response = await fetch(base + "/rest/v1/rpc/myday_sync_profile", {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_telegram_id: telegramId,
          p_data: body.data,
          p_expected_revision: expectedRevision,
        }),
      });
      if (!response.ok) {
        console.error("MYDAY profile save failed:", response.status, await response.text());
        return json({ error: "Не удалось сохранить профиль в облаке" }, 502);
      }
      const rows = await response.json();
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result) return json({ error: "Пустой ответ базы данных" }, 502);
      if (result.conflict) return json({ conflict: true, data: result.data, revision: Number(result.revision) }, 409);
      return json({ ok: true, revision: Number(result.revision) });
    }

    return json({ error: "Неизвестное действие" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    const authError = /Telegram|подпись|авторизац/i.test(message);
    return json({ error: message }, authError ? 401 : 400);
  }
});
