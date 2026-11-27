import * as XLSX from "npm:xlsx@0.18.5";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

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

  if (["xlsx", "xls", "xlsm", "xlsb"].includes(ext) || /spreadsheet|excel/i.test(mime)) {
    const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
    const chunks: string[] = [];
    for (const name of workbook.SheetNames.slice(0, 12)) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
      if (csv.trim()) chunks.push("ЛИСТ: " + name + "\n" + csv);
    }
    if (workbook.SheetNames.length > 12) warnings.push("Обработаны первые 12 листов Excel.");
    const text = chunks.join("\n\n");
    if (!text.trim()) throw new Error("В Excel-файле не найдены заполненные ячейки.");
    return { text: text.slice(0, 45000), format: "Excel", warnings };
  }

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
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise;
    const pages = Math.min(pdf.numPages, 40);
    if (pdf.numPages > pages) warnings.push("Обработаны первые 40 страниц PDF.");
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
      const line = items.map((item) => String(item.str || "") + (item.hasEOL ? "\n" : " ")).join("");
      if (line.trim()) chunks.push("СТРАНИЦА " + pageNumber + "\n" + line);
    }
    const text = chunks.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
    if (text.length < 40) throw new Error("В PDF не удалось извлечь текст. Похоже, это скан или документ из изображений. Пришли страницы PDF отдельными фотографиями, тогда распознаю их.");
    return { text: text.slice(0, 45000), format: "PDF", warnings };
  }

  if (ext === "doc") throw new Error("Старый формат DOC не поддерживается напрямую. Сохрани документ как DOCX или PDF и отправь ещё раз.");
  throw new Error("Формат файла не поддерживается. Отправь PDF, DOCX, XLSX, XLS, CSV, TSV, TXT или ODT.");
}
