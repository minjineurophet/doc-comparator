// 갭 분석 요약 — 클라이언트 헬퍼.
// 실제 LLM(Claude) 호출은 서버 라우트(/api/gap-analysis)에서 수행한다(키 비노출).
// 이 모듈은 ① 요약 요청 ② 결과 → Markdown 변환/다운로드 만 담당.

export const GAP_TYPES = ['핵심변경', '표현정합', '신규', '삭제', '확인필요'];
export const GAP_TYPE_META = {
  핵심변경: { color: 'red',     desc: '요구사항/의미가 실제로 바뀐 변경' },
  표현정합: { color: 'gray',    desc: '문구·표기 정합성 변경(의미 영향 적음)' },
  신규:     { color: 'green',   desc: '새로 추가된 조항' },
  삭제:     { color: 'amber',   desc: '제거된 조항' },
  확인필요: { color: 'blue',    desc: '판단·결정이 필요한 항목' },
};

/**
 * 서버에 갭 분석 요약을 요청한다.
 * @param {object} comparison  저장된 비교 객체(diffs/stats 포함)
 * @returns {Promise<object>} 구조화된 요약
 */
export async function requestGapSummary(comparison) {
  const res = await fetch('/api/gap-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: comparison.name,
      oldFilename: comparison.document1Filename,
      newFilename: comparison.document2Filename,
      stats: comparison.stats,
      diffs: comparison.diffs,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `갭 분석 실패 (${res.status})`);
    err.code = data.code;
    throw err;
  }
  return data;
}

// ── Markdown 내보내기 ─────────────────────────────────────────────
const PRIORITY_RANK = { 상: 0, 중: 1, 하: 2 };

function esc(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function summaryToMarkdown(summary, comparison) {
  const s = comparison.stats || {};
  const lines = [];
  lines.push(`# 갭 분석 요약 — ${comparison.name}`);
  lines.push('');
  lines.push(`> ${comparison.document1Filename || '문서1'} → ${comparison.document2Filename || '문서2'}  ·  생성: ${(summary.generatedAt || '').slice(0, 19).replace('T', ' ')}`);
  lines.push(`> 변경 통계: 추가 ${s.added ?? 0} · 수정 ${s.modified ?? 0} · 삭제 ${s.removed ?? 0}`);
  lines.push('');
  if (summary.oneLine) { lines.push(`**${summary.oneLine}**`); lines.push(''); }

  if (summary.overview?.length) {
    lines.push('## 한눈에 보기');
    lines.push('');
    lines.push('| 조항 | 섹션 | 핵심 변경 | 유형 | 우선순위 |');
    lines.push('| --- | --- | --- | --- | --- |');
    const ov = [...summary.overview].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
    for (const o of ov) {
      lines.push(`| ${o.clauseId || ''} | ${esc(o.section)} | ${esc(o.change)} | ${o.type || ''} | ${o.priority || ''} |`);
    }
    lines.push('');
  }

  for (const type of GAP_TYPES) {
    const items = summary.groups?.[type] || [];
    if (!items.length) continue;
    lines.push(`## ${type}`);
    lines.push('');
    for (const it of items) lines.push(`- **[${it.clauseId || '-'}]** ${esc(it.summary)}`);
    lines.push('');
  }

  if (summary.decisions?.length) {
    lines.push('## 의사결정 필요');
    lines.push('');
    summary.decisions.forEach((d) => lines.push(`- [ ] ${esc(d)}`));
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadSummaryMarkdown(summary, comparison) {
  const md = summaryToMarkdown(summary, comparison);
  const safeName = (comparison.name || 'comparison').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + md], { type: 'text/markdown;charset=utf-8' }));
  a.download = `${safeName}_갭분석.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
