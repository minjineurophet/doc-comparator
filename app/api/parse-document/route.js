import { NextResponse } from 'next/server';
import { getStoredDocument, getStoredDocumentPath } from '@/lib/documentStorage';
import { readFile } from 'node:fs/promises';

export const runtime = 'nodejs';

const DOCLING_SERVICE_URL = process.env.DOCLING_SERVICE_URL || 'http://localhost:8080';

/**
 * Forward the uploaded file to the Docling Python microservice.
 * Falls back to legacy JS parsers if the service is unreachable.
 */
async function parseWithDocling(file) {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetch(`${DOCLING_SERVICE_URL}/parse`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(120_000), // 2-min timeout for large docs
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Docling service error ${res.status}`);
  }

  return res.json(); // { markdown, format, filename }
}

/** Strip markdown syntax to produce plain text (used when Docling doesn't return a text field). */
function markdownToPlainText(md) {
  return md
    .split('\n')
    .map(line => line.replace(/^#{1,6}\s+/, '').replace(/[*_`~]/g, ''))
    .join('\n');
}

// ── Legacy fallback parsers (used when Docling service is not running) ──────

function detectFormat(filename, mimeType) {
  const ext = filename?.split('.').pop().toLowerCase();
  if (ext === 'pdf' || mimeType?.includes('pdf')) return 'pdf';
  if (ext === 'docx' || mimeType?.includes('wordprocessingml')) return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || mimeType?.includes('spreadsheetml') || mimeType?.includes('ms-excel')) return 'xlsx';
  throw new Error(`지원하지 않는 파일 형식입니다 (${filename}). PDF, Word(.docx), Excel(.xlsx)만 지원합니다.`);
}

async function parseWord(buffer) {
  const mammoth = (await import('mammoth')).default;

  // Use HTML output to preserve heading levels (h1/h2/h3...) that Word's
  // auto-numbered outline styles strip from raw text extraction.
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Build numbered markdown from heading hierarchy.
  const counters = [0, 0, 0, 0, 0, 0];
  const lines = [];

  // Split into heading and paragraph tokens.
  const tokenRe = /<(h[1-6]|p)([^>]*)>([\s\S]*?)<\/(?:h[1-6]|p)>/g;
  let match;
  while ((match = tokenRe.exec(html)) !== null) {
    const tag = match[1];
    const inner = match[3].replace(/<[^>]+>/g, '').trim();
    if (!inner) continue;

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]) - 1; // 0-indexed
      counters[level]++;
      for (let i = level + 1; i < counters.length; i++) counters[i] = 0;
      const num = counters.slice(0, level + 1).join('.');
      lines.push(`${'#'.repeat(level + 1)} ${num} ${inner}`);
    } else {
      lines.push(inner);
    }
  }

  return lines.join('\n\n');
}

async function parseExcel(buffer) {
  const xlsx = await import('xlsx');
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    return `[Sheet: ${name}]\n` + xlsx.utils.sheet_to_txt(sheet);
  });
  return sheets.join('\n\n');
}

async function parsePdf(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

function textToMarkdown(text) {
  const clauseRegex = /^(\d+(?:\.\d+){0,4})\.?\s{1,8}([^\n]{2,})/;
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const match = trimmed.match(clauseRegex);
      if (match) {
        const depth = match[1].split('.').length;
        return `${'#'.repeat(Math.min(depth + 1, 6))} ${match[1]} ${match[2]}`;
      }
      return trimmed;
    })
    .join('\n');
}

async function parseLegacy(file) {
  const format = detectFormat(file.name, file.type);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text;
  if (format === 'pdf')  text = await parsePdf(buffer);
  if (format === 'docx') text = await parseWord(buffer);
  if (format === 'xlsx') text = await parseExcel(buffer);
  // parseWord already returns numbered markdown; other formats need conversion.
  const markdown = format === 'docx' ? text : textToMarkdown(text);
  return { text, markdown, format, parser: 'legacy' };
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/parse-document?documentId=<id>
 * Re-parses a previously uploaded document using the current parser logic.
 * Used to refresh stale cached markdown (e.g. after parser improvements).
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

    const doc = await getStoredDocument(documentId);
    if (!doc) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });

    const diskPath = getStoredDocumentPath(doc);
    const buffer = await readFile(diskPath);
    const file = new File([buffer], doc.filename, { type: doc.mimeType });

    // Try Docling first, then legacy
    try {
      const result = await parseWithDocling(file);
      const text = result.text ?? markdownToPlainText(result.markdown ?? '');
      return NextResponse.json({ ...result, text, parser: 'docling' });
    } catch {
      // fall through to legacy
    }

    const result = await parseLegacy(file);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // 1. Try Docling service first
    try {
      const result = await parseWithDocling(file);
      // Derive plain text from markdown so the frontend always receives a `text` field
      const text = result.text ?? markdownToPlainText(result.markdown ?? '');
      return NextResponse.json({ ...result, text, parser: 'docling' });
    } catch (doclingErr) {
      // Service not running → fall back silently
      console.warn('[parse-document] Docling service unavailable, using legacy parser:', doclingErr.message);
    }

    // 2. Legacy JS fallback
    const result = await parseLegacy(file);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
