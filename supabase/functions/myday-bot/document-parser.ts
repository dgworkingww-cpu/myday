import { strFromU8, unzipSync } from "npm:fflate@0.8.2";

export type ExtractedScheduleDocument = {
  text: string;
  format: string;
  warnings: string[];
};

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function wordXmlToText(xml: string): string {
  return decodeXml(xml
    .replace(/<w:tab\b[^>]*\/?\s*>/g, "\t")
    .replace(/<w:br\b[^>]*\/?\s*>/g, "\n")
    .replace(/<\/w:(?:p|tr|tc)>/g, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function xlsxToText(bytes: Uint8Array): { text: string; warnings: string[] } {
  const files = unzipSync(bytes);
  const warnings: string[] = [];
  const sharedXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const sharedStrings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join("")
  );
  const sheetPaths = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => {
    const na = Number(a.match(/sheet(\d+)/)?.[1] || 0), nb = Number(b.match(/sheet(\d+)/)?.[1] || 0);
    return na - nb;
  });
  const chunks: string[] = [];
  for (const [sheetIndex, path] of sheetPaths.slice(0, 12).entries()) {
    const xml = strFromU8(files[path]);
    const rows: string[] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = new Map<number, string>();
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
        const attrs = cellMatch[1] || cellMatch[3] || "";
        const body = cellMatch[2] || "";
        const ref = attrs.match(/\br="([A-Z]+)\d+"/i)?.[1] || "";
        if (!ref) continue;
        let column = 0;
        for (const char of ref) column = column * 26 + char.charCodeAt(0) - 64;
        column--;
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
        const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
        let text = "";
        if (type === "s" && value !== "") text = sharedStrings[Number(value)] || "";
        else if (type === "inlineStr") text = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join("");
        else if (value !== "") {
          const number = Number(value);
          text = Number.isFinite(number) && number > 0 && number < 1 && /\./.test(value)
            ? (() => { const minutes = Math.round(number * 1440); return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"); })()
            : decodeXml(value);
        }
        if (text) cells.set(column, text);
      }
      if (cells.size) {
        const max = Math.max(...cells.keys());
        rows.push(Array.from({ length: max + 1 }, (_, i) => cells.get(i) || "").join("\t"));
      }
    }
    if (rows.length) chunks.push("ЛИСТ " + (sheetIndex + 1) + "\n" + rows.join("\n"));
  }
  if (sheetPaths.length > 12) warnings.push("Обработаны первые 12 листов Excel.");
  return { text: chunks.join("\n\n"), warnings };
}

function decodeText(bytes: Uint8Array): string {
  let value = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  if ((value.match(/�/g) || []).length > 5) {
    try { value = new TextDecoder("windows-1251").decode(bytes); } catch { /* UTF-8 fallback */ }
  }
  return value;
}

export async function extractScheduleDocument(
  bytes: Uint8Array,
  filename: string,
  mime = "",
): Promise<ExtractedScheduleDocument> {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const warnings: string[] = [];
  if (bytes.byteLength === 0) throw new Error("Файл пустой.");
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ. Telegram Bot API не позволяет скачать такой документ через обычного бота. Раздели его на части.");

  if (["txt", "csv", "tsv", "json"].includes(ext) || /^text\/(plain|csv|tab-separated-values)/i.test(mime)) {
    const text = decodeText(bytes);
    if (!text.trim()) throw new Error("В текстовом файле нет содержимого.");
    return { text: text.slice(0, 45000), format: ext || "text", warnings };
  }

  if (["xlsx", "xlsm"].includes(ext) || /spreadsheetml|excel.sheet/i.test(mime)) {
    const workbook = xlsxToText(bytes);
    if (!workbook.text.trim()) throw new Error("В Excel-файле не найдены заполненные ячейки.");
    return { text: workbook.text.slice(0, 45000), format: "Excel", warnings: workbook.warnings };
  }
  if (ext === "xls" || ext === "xlsb") throw new Error("Старый формат Excel не поддерживается напрямую. Сохрани файл как XLSX и отправь ещё раз.");

  if (ext === "docx" || /wordprocessingml\.document/i.test(mime)) {
    const files = unzipSync(bytes);
    const document = files["word/document.xml"];
    if (!document) throw new Error("В DOCX не найден основной текст документа.");
    const text = wordXmlToText(strFromU8(document));
    if (!text) throw new Error("В DOCX не найден текст. Возможно, это документ со сканами или изображениями.");
    return { text: text.slice(0, 45000), format: "Word DOCX", warnings };
  }

  if (ext === "odt" || /opendocument\.text/i.test(mime)) {
    const files = unzipSync(bytes);
    const content = files["content.xml"];
    if (!content) throw new Error("В ODT не найден текст документа.");
    const text = wordXmlToText(strFromU8(content).replace(/<text:/g, "<w:").replace(/<\/text:/g, "</w:"));
    if (!text) throw new Error("В ODT не найден текст.");
    return { text: text.slice(0, 45000), format: "OpenDocument", warnings };
  }

  if (ext === "pdf" || /application\/pdf/i.test(mime)) {
    // PDF.js is isolated in its own Edge Function to keep the main bot bundle below Supabase's upload limit.
    const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const secret = Deno.env.get("MYDAY_WEBHOOK_SECRET") || "";
    if (!base || !secret) throw new Error("Не настроен внутренний сервис обработки PDF.");
    const response = await fetch(base + "/functions/v1/myday-pdf-parser", {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-myday-internal-secret": secret, "x-myday-filename": encodeURIComponent(filename) },
      body: bytes,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.text) throw new Error(String(result?.error || "Не удалось извлечь текст из PDF."));
    return { text: String(result.text).slice(0, 45000), format: "PDF", warnings: Array.isArray(result.warnings) ? result.warnings : warnings };
  }

  if (ext === "doc") throw new Error("Старый формат DOC не поддерживается напрямую. Сохрани документ как DOCX или PDF и отправь ещё раз.");
  throw new Error("Формат файла не поддерживается. Отправь PDF, DOCX, XLSX, XLSM, CSV, TSV, TXT, JSON или ODT. Старый XLS сначала сохрани как XLSX.");
}
