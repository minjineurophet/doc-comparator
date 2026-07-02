import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 갭 분석 요약 API — 비교 diff(갭) 내용을 읽어 LLM(Claude)이 분석·요약한다.
// 서버에서 호출하므로 API 키가 클라이언트에 노출되지 않는다.
//
// 환경변수 (둘 중 하나):
//   사내 프록시:   GAP_PROXY_URL  (+ 선택 GAP_PROXY_AUTH = Authorization 헤더 값)
//   Anthropic 직접: ANTHROPIC_API_KEY (+ 선택 ANTHROPIC_BASE_URL)
//   공통:          GAP_MODEL (기본 gpt-5.4 — 사내 LiteLLM 게이트웨이 제공 모델)

const GAP_PROXY_URL = process.env.GAP_PROXY_URL || '';
const GAP_PROXY_AUTH = process.env.GAP_PROXY_AUTH || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.GAP_MODEL || 'gpt-5.4';

export const GAP_TYPES = ['핵심변경', '표현정합', '신규', '삭제', '확인필요'];

const SYSTEM_PROMPT = `너는 인허가/규격 문서의 두 버전(문서1 → 문서2) 사이의 변경을 분석하는 전문가다.
입력으로 조항 단위 Diff(추가/수정/삭제)와 각 조항의 이전/이후 본문을 받는다.
이를 검토자가 의사결정에 바로 쓸 수 있는 "갭 분석 요약"으로 정리한다.

규칙:
- 입력 Diff에 드러난 사실만 근거로 한다. 원문에 없는 내용을 지어내지 마라.
- 모든 출력은 한국어로 작성한다.
- 각 변경을 다음 유형 중 하나로 분류한다: 핵심변경 | 표현정합 | 신규 | 삭제 | 확인필요.
  · 핵심변경: 요구사항·범위·의미가 실제로 바뀜
  · 표현정합: 문구/표기 수준 변경(의미 영향 적음)
  · 신규/삭제: 조항 추가/제거
  · 확인필요: 의도·영향이 모호해 판단이 필요
- 우선순위는 상 | 중 | 하 (요구사항·안전·규제 영향이 클수록 상).
- clauseId 는 반드시 입력으로 받은 조항 번호(clauseNumber)만 사용한다. 새로 만들지 마라.
- 출력은 아래 JSON 객체 하나만, 코드블록·여는말 없이 순수 JSON으로 반환한다.

JSON 스키마:
{
  "oneLine": "한 줄 요약 (예: 총 24개 조항 변경, 핵심 변경 7건, 결정 필요 2건)",
  "overview": [
    { "clauseId": "4.1", "section": "4.1 제목", "change": "핵심 변경 요지 한 문장", "type": "핵심변경", "priority": "상" }
  ],
  "groups": {
    "핵심변경": [ { "clauseId": "4.1", "summary": "..." } ],
    "표현정합": [], "신규": [], "삭제": [], "확인필요": []
  },
  "decisions": [ "검토자가 결정해야 할 항목 한 문장" ]
}`;

function clip(text, max) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function buildUserPrompt({ name, oldFilename, newFilename, stats, diffs }) {
  const order = { modified: 0, added: 1, removed: 2 };
  const sorted = [...(diffs || [])].sort((a, b) => (order[a.changeType] ?? 9) - (order[b.changeType] ?? 9));
  const lines = sorted.map((d) => {
    const label = { added: '신규', modified: '수정', removed: '삭제' }[d.changeType] || d.changeType;
    if (d.changeType === 'added') return `[${d.clauseNumber}] (신규) ${d.title}\n  이후: ${clip(d.after, 600)}`;
    if (d.changeType === 'removed') return `[${d.clauseNumber}] (삭제) ${d.title}\n  이전: ${clip(d.before, 600)}`;
    return `[${d.clauseNumber}] (수정) ${d.title}\n  이전: ${clip(d.before, 500)}\n  이후: ${clip(d.after, 500)}`;
  });
  let body = lines.join('\n\n');
  if (body.length > 24000) body = body.slice(0, 24000) + '\n\n…(이하 생략)';
  return [
    `문서: "${name || ''}"  (${oldFilename || '문서1'} → ${newFilename || '문서2'})`,
    `변경 통계: 추가 ${stats?.added ?? 0} · 수정 ${stats?.modified ?? 0} · 삭제 ${stats?.removed ?? 0}`,
    '',
    '아래는 조항 단위 Diff 목록이다. 이를 갭 분석 요약 JSON으로 정리하라.',
    '',
    body,
  ].join('\n');
}

async function callClaude(userPrompt) {
  const payload = {
    model: MODEL,
    max_tokens: 16000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  let url, headers;
  if (GAP_PROXY_URL) {
    url = GAP_PROXY_URL;
    headers = { 'Content-Type': 'application/json' };
    if (GAP_PROXY_AUTH) headers['Authorization'] = GAP_PROXY_AUTH;
  } else if (ANTHROPIC_API_KEY) {
    url = `${ANTHROPIC_BASE_URL.replace(/\/$/, '')}/v1/messages`;
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    };
  } else {
    const e = new Error('갭 분석 LLM이 설정되지 않았습니다. GAP_PROXY_URL 또는 ANTHROPIC_API_KEY를 설정하세요.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM 호출 실패 (${res.status}) ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractText(data);
}

function extractText(data) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data?.content)) return data.content.map((p) => p?.text || '').join('');
  return data?.text || data?.completion || data?.choices?.[0]?.message?.content || data?.message?.content || '';
}

function parseSummary(text) {
  if (!text) throw new Error('LLM이 빈 응답을 반환했습니다.');
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  else {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1) raw = raw.slice(first, last + 1);
  }
  let obj;
  try { obj = JSON.parse(raw); }
  catch { throw new Error('LLM 응답을 JSON으로 해석하지 못했습니다.'); }

  const groups = obj.groups || {};
  return {
    oneLine: obj.oneLine || '',
    overview: Array.isArray(obj.overview) ? obj.overview : [],
    groups: GAP_TYPES.reduce((acc, t) => { acc[t] = Array.isArray(groups[t]) ? groups[t] : []; return acc; }, {}),
    decisions: Array.isArray(obj.decisions) ? obj.decisions : [],
    generatedAt: new Date().toISOString(),
    model: MODEL,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.diffs?.length) {
      return NextResponse.json({ error: '비교 diff가 없습니다.' }, { status: 400 });
    }
    const text = await callClaude(buildUserPrompt(body));
    return NextResponse.json(parseSummary(text));
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
}
