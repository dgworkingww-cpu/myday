import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
// Keep the matching worker in the module graph for PDF.js' fake-worker fallback.
import "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function runOcrSpace(bytes: Uint8Array): Promise<{ text: string; warning?: string }> {
  // OCR.space free tier supports small PDFs (up to 1 MB / 3 pages).
  // Users can optionally provide their own free API key as OCR_SPACE_API_KEY.
  if (bytes.byteLength > 1024 * 1024) {
    throw new Error("Скан распознан как изображение, но PDF больше лимита бесплатного OCR (1 МБ). Сожми PDF или раздели его на небольшие файлы до 3 страниц.");
  }
  const apiKey = Deno.env.get("OCR_SPACE_API_KEY") || "helloworld";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), "myday-schedule.pdf");
  form.append("language", "rus");
  form.append("OCREngine", "2");
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale", "true");
  form.append("isTable", "true");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: apiKey },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Сервис OCR временно недоступен (HTTP " + response.status + "). Попробуй позже.");
  }
  if (result?.IsErroredOnProcessing) {
    const details = Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join("; ") : String(result.ErrorMessage || "");
    throw new Error(details || "Сервис OCR не смог обработать скан. Проверь качество и размер PDF.");
  }
  const pages = Array.isArray(result?.ParsedResults) ? result.ParsedResults : [];
  const text = pages.map((page: { ParsedText?: string }, i: number) =>
    page.ParsedText?.trim() ? "СТРАНИЦА " + (i + 1) + "\n" + page.ParsedText.trim() : ""
  ).filter(Boolean).join("\n\n").trim();
  if (text.length < 40) throw new Error("OCR завершился, но текст на страницах не удалось уверенно распознать. Пришли PDF получше или фотографии страниц.");
  return { text, warning: "Текст распознан с помощью OCR. Проверь названия предметов, аудитории и время в предварительном просмотре." };
}

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
    if (text.length >= 40) return json({ text: text.slice(0, 45000), warnings });

    // A missing PDF text layer means the pages are scans. Fall back to OCR rather than
    // asking the student to export every page as a separate photo.
    const ocr = await runOcrSpace(bytes);
    warnings.push(ocr.warning || "Текст распознан с помощью OCR.");
    if (pdf.numPages > 3) warnings.push("Бесплатный OCR обрабатывает до 3 страниц за один запрос.");
    return json({ text: ocr.text.slice(0, 45000), warnings });
  } catch (error) {
    console.error("MYDAY PDF parser error:", error);
    return json({ error: error instanceof Error ? error.message : "Ошибка обработки PDF." }, 422);
  }
});
