'use strict';

// 갭 분석 배선 검증용 목 LLM 프록시 (의존성 없음).
// Anthropic Messages API 형식의 고정 응답을 돌려줘 실제 API 키 없이
// /api/gap-analysis 의 extractText/parseSummary 경로를 끝까지 검증할 수 있다.
//
// 실행: npm run mock:gap  (기본 포트 8787 — .env.local 의 GAP_PROXY_URL 과 일치)

const http = require('node:http');

const PORT = parseInt(process.env.MOCK_GAP_PORT || '8787', 10);

const SUMMARY = {
  oneLine: '총 1개 조항 변경, 핵심 변경 1건, 결정 필요 1건 (목 응답)',
  overview: [
    { clauseId: '4.1', section: '4.1 정의', change: '용어 정의가 신규 규격 기준으로 변경됨', type: '핵심변경', priority: '상' },
  ],
  groups: {
    핵심변경: [{ clauseId: '4.1', summary: '용어 정의가 신규 규격 기준으로 변경됨' }],
    표현정합: [],
    신규: [],
    삭제: [],
    확인필요: [],
  },
  decisions: ['4.1 변경이 기존 리스크 분석에 미치는 영향 검토 필요'],
};

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let model = 'claude-sonnet-4-6';
    try { model = JSON.parse(body).model || model; } catch { /* 본문 무시 */ }
    console.log(`[mock-gap-proxy] POST ${req.url} (model=${model}, body ${body.length}B)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: JSON.stringify(SUMMARY) }],
    }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-gap-proxy] listening on http://127.0.0.1:${PORT}`);
});
