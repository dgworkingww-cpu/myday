import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
// Keep the matching worker in the module graph for PDF.js' fake-worker fallback.
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

    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    const warnings: string[] = [];
    if (!isPdf) {
      return json({ error: "MYDAY_LOCAL_OCR_REQUIRED: изображение нужно распознать локально на устройстве через бесплатный инструмент MYDAY." }, 422);
    }
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
    const pages = Math.min(pdf.numPages, 40);
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

    // Scanned pages are routed to browser-based OCR. The open-source WebAssembly
    // engine runs on the user's device, avoiding paid OCR APIs and Edge CPU limits.
    return json({ error: "MYDAY_LOCAL_OCR_REQUIRED: PDF содержит изображения страниц без текстового слоя." }, 422);
  } catch (error) {
    console.error("MYDAY PDF parser error:", error);
    return json({ error: error instanceof Error ? error.message : "Ошибка обработки PDF." }, 422);
  }
});
