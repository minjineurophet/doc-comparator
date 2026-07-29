import { NextResponse } from 'next/server';
import { resolveLlmConfig } from '@/lib/gapConfig';

export const runtime = 'nodejs';

// 갭 분석 요약 API — 비교 diff(갭) 내용을 읽어 LLM(Claude)이 분석·요약한다.
// 서버에서 호출하므로 API 키가 클라이언트에 노출되지 않는다.
//
// 설정은 요청 시점에 lib/gapConfig.js 로 해석한다:
//   설정 화면 저장값(gap-config.json) > 환경변수 폴백.
//   사내 프록시:   proxyUrl / GAP_PROXY_URL  (+ 선택 proxyAuth / GAP_PROXY_AUTH)
//   Anthropic 직접: apiKey / ANTHROPIC_API_KEY (+ 선택 baseUrl / ANTHROPIC_BASE_URL)
//   공통:          model / GAP_MODEL (기본 claude-sonnet-4-6)

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

async function callClaude(userPrompt, cfg) {
  const payload = {
    model: cfg.model,
    // GPT 계열은 출력이 장황해 2000 토큰으로는 조항 많은 문서에서 JSON이 잘린다.
    max_tokens: 16000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  let url, headers;
  if (cfg.proxyUrl) {
    url = cfg.proxyUrl;
    // 게이트웨이 루트만 입력한 경우(경로 없음) 표준 메시지 엔드포인트를 붙인다 —
    // 루트로 POST 하면 HTML(302 페이지)이 돌아와 JSON 파싱 에러가 난다.
    try {
      const u = new URL(url);
      if (u.pathname === '' || u.pathname === '/') {
        u.pathname = '/v1/messages';
        url = u.toString();
      }
    } catch { /* URL 파싱 실패 시 입력값 그대로 사용 */ }
    headers = { 'Content-Type': 'application/json' };
    // proxyAuth 가 없으면 저장된 API 키를 Bearer 로 전송 — LiteLLM 게이트웨이 표준 인증.
    const auth = cfg.proxyAuth || (cfg.apiKey ? `Bearer ${cfg.apiKey}` : '');
    if (auth) headers['Authorization'] = auth;
  } else if (cfg.apiKey) {
    url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`;
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    };
  } else {
    const e = new Error('갭 분석 LLM이 설정되지 않았습니다. 갭 분석 패널의 ⚙ 설정에서 API 키 또는 프록시 URL을 입력하세요.');
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

function parseSummary(text, model) {
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
    model,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.diffs?.length) {
      return NextResponse.json({ error: '비교 diff가 없습니다.' }, { status: 400 });
    }
    const cfg = await resolveLlmConfig();
    const text = await callClaude(buildUserPrompt(body), cfg);
    return NextResponse.json(parseSummary(text, cfg.model));
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
}
