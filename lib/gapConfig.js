import path from 'node:path';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

// 갭 분석 LLM 설정 저장소.
// 설정 화면(/api/gap-config)에서 저장한 값이 gap-config.json 에 남고,
// 환경변수는 폴백으로만 쓰인다 — 패키징된 Electron 앱은 셸 환경변수를
// 상속받지 못하므로 파일 저장이 유일하게 항상 동작하는 경로다.
const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT
  || path.join(process.cwd(), '.data', 'documents');
const CONFIG_FILE = path.join(STORAGE_ROOT, 'gap-config.json');

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

const FIELDS = ['proxyUrl', 'proxyAuth', 'apiKey', 'baseUrl', 'model'];

export async function readGapConfig() {
  let raw;
  try {
    raw = await readFile(CONFIG_FILE, 'utf8');
  } catch {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 파손된 파일은 무시하고 env 폴백에 맡긴다. 다음 저장 시 덮어써진다.
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const config = {};
  for (const field of FIELDS) {
    if (typeof parsed[field] === 'string' && parsed[field].trim()) {
      config[field] = parsed[field].trim();
    }
  }
  return config;
}

// partial 에 존재하는 필드만 갱신한다: 비어있지 않으면 저장, '' 이면 삭제(클리어),
// 없는 필드는 유지. 클리어된 필드는 env 폴백으로 되돌아간다.
export async function writeGapConfig(partial) {
  const stored = await readGapConfig();
  for (const field of FIELDS) {
    if (!(field in partial)) continue;
    const value = String(partial[field] ?? '').trim();
    if (value) stored[field] = value;
    else delete stored[field];
  }
  await mkdir(STORAGE_ROOT, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8');
  await rename(tmp, CONFIG_FILE);
  return stored;
}

// 필드별 우선순위: 저장값 > 환경변수 > 기본값.
export async function resolveLlmConfig() {
  const stored = await readGapConfig();
  return {
    proxyUrl: stored.proxyUrl || process.env.GAP_PROXY_URL || '',
    proxyAuth: stored.proxyAuth || process.env.GAP_PROXY_AUTH || '',
    apiKey: stored.apiKey || process.env.ANTHROPIC_API_KEY || '',
    baseUrl: stored.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: stored.model || process.env.GAP_MODEL || DEFAULT_MODEL,
  };
}
