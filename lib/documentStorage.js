import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';

// In Electron production builds, DOCUMENT_STORAGE_ROOT is set to app.getPath('userData')/documents
// so uploaded files persist in the OS user-data directory instead of the app bundle.
const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT
  || path.join(process.cwd(), '.data', 'documents');
const FILES_DIR = path.join(STORAGE_ROOT, 'files');
const INDEX_FILE = path.join(STORAGE_ROOT, 'index.json');


function normalizeFileType(filename) {
  return path.extname(filename || '').slice(1).toLowerCase();
}

function normalizeFilename(filename) {
  const normalized = (filename || '').trim();
  return normalized || 'document';
}

async function ensureStorage() {
  await mkdir(FILES_DIR, { recursive: true });
  try {
    await readFile(INDEX_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeFile(INDEX_FILE, '{}', 'utf8');
      return;
    }
    throw error;
  }
}

function extractJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return raw.slice(start, end + 1);
}

async function recoverCorruptedIndex(raw) {
  const trimmed = raw?.trim() || '';
  const salvaged = extractJsonObject(trimmed);

  if (salvaged) {
    try {
      const parsed = JSON.parse(salvaged);
      await writeFile(INDEX_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      return parsed;
    } catch {
      // Fall through to empty reset below.
    }
  }

  const backupName = `index.corrupt-${Date.now()}.json`;
  const backupPath = path.join(STORAGE_ROOT, backupName);

  try {
    await rename(INDEX_FILE, backupPath);
  } catch {
    // If backup rename fails, still continue with a clean reset.
  }

  const emptyIndex = {};
  await writeFile(INDEX_FILE, JSON.stringify(emptyIndex, null, 2), 'utf8');
  return emptyIndex;
}

async function readIndex() {
  await ensureStorage();
  const raw = await readFile(INDEX_FILE, 'utf8');

  try {
    return JSON.parse(raw || '{}');
  } catch (error) {
    if (error instanceof SyntaxError) {
      return recoverCorruptedIndex(raw);
    }
    throw error;
  }
}

async function writeIndex(index) {
  await ensureStorage();
  const tmp = INDEX_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
  await rename(tmp, INDEX_FILE);
}


export async function saveUploadedDocument(file) {
  const filename = normalizeFilename(file?.name);
  const fileType = normalizeFileType(filename);
  const SUPPORTED_TYPES = new Set(['pdf', 'docx', 'xlsx', 'xls', 'doc']);
  if (!SUPPORTED_TYPES.has(fileType)) {
    throw new Error('지원하지 않는 파일 형식입니다 (' + (fileType || 'unknown') + ').');
  }

  const id = crypto.randomUUID();
  const storedFilename = `${id}.${fileType}`;
  const diskPath = path.join(FILES_DIR, storedFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  const createdAt = new Date().toISOString();

  await ensureStorage();
  await writeFile(diskPath, buffer);

  const index = await readIndex();
  index[id] = {
    id,
    filename,
    fileType,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.byteLength,
    storedFilename,
    createdAt,
  };
  await writeIndex(index);

  return index[id];
}

const MIME_BY_TYPE = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
};

export async function getStoredDocument(id) {
  const index = await readIndex();
  if (index[id]) return index[id];

  // Fallback: file exists on disk but index entry is missing (race-condition orphan).
  // Reconstruct the entry and repair the index so future reads are fast.
  for (const type of Object.keys(MIME_BY_TYPE)) {
    const storedFilename = `${id}.${type}`;
    const diskPath = path.join(FILES_DIR, storedFilename);
    try {
      const info = await stat(diskPath);
      const entry = {
        id,
        filename: `document.${type}`,
        fileType: type,
        mimeType: MIME_BY_TYPE[type],
        size: info.size,
        storedFilename,
        createdAt: info.mtime.toISOString(),
      };
      index[id] = entry;
      await writeIndex(index);
      return entry;
    } catch {
      // File doesn't exist for this type; try next.
    }
  }

  return null;
}

export function getStoredDocumentPath(document) {
  return path.join(FILES_DIR, document.storedFilename);
}

