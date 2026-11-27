import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
// Bundle the matching worker module into this Edge Function so PDF.js fake-worker fallback
// can resolve the exact same module from the module cache without a runtime CDN import.
import "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expected = Deno.env.get("MYDAY_WEBHOOK_SECRET") || "";
  const supplied = req.headers.get("x-myday-internal-secret") || "";
  if (!expected || supplied !== expected) return json({ error: "Unauthorized" }, 401);

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.byteLength) return json({ error: "PDF пустой." }, 400);
    if (bytes.byteLength > 20 * 1024 * 1024) return json({ error: "PDF больше 20 МБ." }, 413);

    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
    const pages = Math.min(pdf.numPages, 40);
    const warnings: string[] = [];
    if (pdf.numPages > pages) warnings.push("Обработаны первые 40 страниц PDF.");
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as unknown as Array<{ str?: string; hasEOL?: boolean }>;
      const line = items.map((item) => String(item.str || "") + (item.hasEOL ? "\n" : " ")).join("");
      if (line.trim()) chunks.push("СТРАНИЦА " + pageNumber + "\n" + line);
    }
    const text = chunks.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
    if (text.length < 40) {
      return json({ error: "В PDF не удалось извлечь текст. Похоже, это скан или документ из изображений. Пришли страницы PDF отдельными фотографиями." }, 422);
    }
    return json({ text: text.slice(0, 45000), warnings });
  } catch (error) {
    console.error("MYDAY PDF parser error:", error);
    return json({ error: error instanceof Error ? error.message : "Ошибка обработки PDF." }, 500);
  }
});
