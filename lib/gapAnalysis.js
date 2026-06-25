// 갭 분석 요약 — 두 문서 버전의 Diff 결과(cmp.diffs)를 의미 단위로 요약한다.
// 정적 앱(output:'export')이라 서버가 없으므로 "사내 Claude 프록시"에 브라우저에서 직접 fetch 한다.
// 프롬프트/출력 스키마의 단일 출처: docs/gap-analysis-agent.md
//
// 환경변수(빌드 시 인라인):
//   NEXT_PUBLIC_GAP_PROXY_URL  사내 Claude 프록시 엔드포인트 (미설정 시 기능 비활성)
//   NEXT_PUBLIC_GAP_MODEL      사용할 모델 ID (기본 claude-sonnet-4-6)

const PROXY_URL = process.env.NEXT_PUBLIC_GAP_PROXY_URL || '';
const MODEL = process.env.NEXT_PUBLIC_GAP_MODEL || 'claude-sonnet-4-6';

// 변경 의미 유형 (2-way 버전 diff 기준)
export const GAP_TYPES = ['핵심변경', '표현정합', '신규', '삭제', '확인필요'];
export const GAP_TYPE_META = {
  핵심변경: { color: 'red',     desc: '요구사항/의미가 실제로 바뀐 변경' },
  표현정합: { color: 'gray',    desc: '문구·표기 정합성 변경(의미 영향 적음)' },
  신규:     { color: 'emerald', desc: '새로 추가된 조항' },
  삭제:     { color: 'amber',   desc: '제거된 조항' },
  확인필요: { color: 'blue',    desc: '판단·결정이 필요한 항목' },
};

const SYSTEM_PROMPT = `너는 인허가/규격 문서의 두 버전(이전 → 새 버전) 사이의 변경을 분석하는 전문가다.
입력으로 조항 단위 Diff(추가/수정/삭제)를 받는다. 이를 검토자가 결정에 바로 쓸 수 있는 "갭 분석 요약"으로 정리한다.

규칙:
- 원문에 없는 내용을 지어내지 마라. Diff에 나타난 사실만 근거로 한다.
- 모든 출력은 한국어로 작성한다.
- 각 변경을 다음 유형 중 하나로 분류한다: 핵심변경 | 표현정합 | 신규 | 삭제 | 확인필요.
- 우선순위는 상 | 중 | 하 로 매긴다(요구사항·안전·규제 영향이 클수록 상).
- clauseId 는 반드시 입력으로 받은 조항 id 만 사용한다(새로 만들지 마라).
- 출력은 아래 JSON 스키마 하나만, 코드블록 없이 순수 JSON으로 반환한다.

JSON 스키마:
{
  "oneLine": "한 줄 요약 (예: 총 12개 조항 변경, 핵심 변경 4건, 결정 필요 2건)",
  "overview": [
    { "clauseId": "3.2", "section": "3.2 공통·전역 표준", "change": "핵심 변경 요지 한 문장", "type": "핵심변경", "priority": "상" }
  ],
  "groups": {
    "핵심변경": [ { "clauseId": "...", "summary": "..." } ],
    "표현정합": [],
    "신규": [],
    "삭제": [],
    "확인필요": []
  },
  "decisions": [ "검토자가 결정해야 할 항목 한 문장" ]
}`;

export function isProxyConfigured() {
  return !!PROXY_URL;
}

// Diff 항목 본문을 토큰 절약형으로 자른다.
function clip(text, max) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// cmp.diffs → 모델 입력용 직렬화. 조항이 많으면 우선순위 높은 status(modified)부터.
function serializeDiffs(cmp) {
  const order = { modified: 0, added: 1, removed: 2 };
  const diffs = [...(cmp.diffs || [])].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
  );
  const lines = diffs.map((d) => {
    if (d.status === 'added') return `[${d.id}] (신규) ${d.title}\n  새: ${clip(d.newContent, 600)}`;
    if (d.status === 'removed') return `[${d.id}] (삭제) ${d.title}\n  이전: ${clip(d.oldContent, 600)}`;
    return `[${d.id}] (수정) ${d.title}\n  이전: ${clip(d.oldContent, 500)}\n  새: ${clip(d.newContent, 500)}`;
  });
  // 전체 길이 안전장치 (~24k자)
  const joined = lines.join('\n\n');
  return joined.length > 24000 ? joined.slice(0, 24000) + '\n\n…(이하 생략)' : joined;
}

function buildUserPrompt(cmp) {
  const s = cmp.stats || {};
  return [
    `문서: "${cmp.name}"  (${cmp.oldFileName} → ${cmp.newFileName})`,
    `변경 통계: 추가 ${s.added ?? 0} · 수정 ${s.modified ?? 0} · 삭제 ${s.removed ?? 0}`,
    '',
    '아래는 조항 단위 Diff 목록이다. 이를 갭 분석 요약 JSON으로 정리하라.',
    '',
    serializeDiffs(cmp),
  ].join('\n');
}

// 프록시 응답에서 텍스트 추출 — Anthropic Messages 형식 및 흔한 변형을 폭넓게 수용.
function extractText(data) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data?.content)) {
    return data.content.map((p) => p?.text || '').join('');
  }
  return (
    data?.text ||
    data?.completion ||
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    ''
  );
}

function parseSummary(text) {
  if (!text) throw new Error('빈 응답');
  // 코드블록/잡텍스트 안의 JSON 추출
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  else {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1) raw = raw.slice(first, last + 1);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('응답을 JSON으로 해석하지 못했습니다.');
  }
  // 스키마 정규화(누락 필드 방어)
  const groups = obj.groups || {};
  return {
    oneLine: obj.oneLine || '',
    overview: Array.isArray(obj.overview) ? obj.overview : [],
    groups: GAP_TYPES.reduce((acc, t) => {
      acc[t] = Array.isArray(groups[t]) ? groups[t] : [];
      return acc;
    }, {}),
    decisions: Array.isArray(obj.decisions) ? obj.decisions : [],
    generatedAt: new Date().toISOString(),
    model: MODEL,
  };
}

/**
 * 갭 분석 요약 생성.
 * @param {object} cmp  저장된 비교 객체 (diffs/stats 포함)
 * @param {object} opts { model?, signal? }
 * @returns {Promise<object>} 정규화된 요약 객체
 */
export async function generateGapSummary(cmp, opts = {}) {
  if (!PROXY_URL) {
    const e = new Error('갭 분석 프록시가 설정되지 않았습니다 (NEXT_PUBLIC_GAP_PROXY_URL).');
    e.code = 'PROXY_NOT_CONFIGURED';
    throw e;
  }
  if (!cmp?.diffs?.length) {
    const e = new Error('비교 결과(diffs)가 없습니다.');
    e.code = 'NO_DIFFS';
    throw e;
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 사내 프록시 요청 포맷. Anthropic Messages 호환을 가정 — 프록시 스펙에 맞게 조정.
    body: JSON.stringify({
      model: opts.model || MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(cmp) }],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`프록시 오류 (${res.status}). 엔드포인트/인증/CORS 설정을 확인하세요.`);
  }
  const data = await res.json().catch(() => null);
  return parseSummary(extractText(data));
}

// ── Markdown 내보내기 ─────────────────────────────────────────────
const PRIORITY_RANK = { 상: 0, 중: 1, 하: 2 };

export function summaryToMarkdown(summary, cmp) {
  const s = cmp.stats || {};
  const lines = [];
  lines.push(`# 갭 분석 요약 — ${cmp.name}`);
  lines.push('');
  lines.push(`> ${cmp.oldFileName} → ${cmp.newFileName}  ·  생성: ${(summary.generatedAt || '').slice(0, 19).replace('T', ' ')}`);
  lines.push(`> 변경 통계: 추가 ${s.added ?? 0} · 수정 ${s.modified ?? 0} · 삭제 ${s.removed ?? 0}`);
  lines.push('');
  if (summary.oneLine) {
    lines.push(`**${summary.oneLine}**`);
    lines.push('');
  }

  // 한눈에 보기 표
  if (summary.overview?.length) {
    lines.push('## 한눈에 보기');
    lines.push('');
    lines.push('| 조항 | 섹션 | 핵심 변경 | 유형 | 우선순위 |');
    lines.push('| --- | --- | --- | --- | --- |');
    const ov = [...summary.overview].sort(
      (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    );
    for (const o of ov) {
      lines.push(`| ${o.clauseId || ''} | ${esc(o.section)} | ${esc(o.change)} | ${o.type || ''} | ${o.priority || ''} |`);
    }
    lines.push('');
  }

  // 유형별 그룹
  for (const type of GAP_TYPES) {
    const items = summary.groups?.[type] || [];
    if (!items.length) continue;
    lines.push(`## ${type}`);
    lines.push('');
    for (const it of items) {
      lines.push(`- **[${it.clauseId || '-'}]** ${esc(it.summary)}`);
    }
    lines.push('');
  }

  // 의사결정 필요
  if (summary.decisions?.length) {
    lines.push('## 의사결정 필요');
    lines.push('');
    summary.decisions.forEach((d) => lines.push(`- [ ] ${esc(d)}`));
    lines.push('');
  }

  return lines.join('\n');
}

function esc(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function downloadSummaryMarkdown(summary, cmp) {
  const md = summaryToMarkdown(summary, cmp);
  const safeName = (cmp.name || 'comparison').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + md], { type: 'text/markdown;charset=utf-8' }));
  a.download = `${safeName}_갭분석.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
