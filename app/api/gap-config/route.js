import { NextResponse } from 'next/server';
import { resolveLlmConfig, writeGapConfig } from '@/lib/gapConfig';

export const runtime = 'nodejs';

// 갭 분석 LLM 설정 조회/저장 API.
// 키 원문(apiKey/proxyAuth)은 절대 응답에 포함하지 않는다.
// GET 은 해석된(저장값+env 폴백) 값을 돌려줘 UI가 현재 유효 설정을 보여줄 수 있게 한다.

async function maskedView() {
  const cfg = await resolveLlmConfig();
  return {
    proxyUrl: cfg.proxyUrl,
    model: cfg.model,
    hasApiKey: Boolean(cfg.apiKey),
    apiKeyLast4: cfg.apiKey ? cfg.apiKey.slice(-4) : '',
    hasProxyAuth: Boolean(cfg.proxyAuth),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await maskedView());
  } catch (err) {
    return NextResponse.json({ error: '설정을 불러오지 못했습니다: ' + err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
    }

    const partial = {};
    for (const field of ['proxyUrl', 'apiKey', 'model']) {
      if (!(field in body)) continue;
      if (typeof body[field] !== 'string') {
        return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
      }
      partial[field] = body[field];
    }

    const proxyUrl = (partial.proxyUrl ?? '').trim();
    if (proxyUrl) {
      let parsed;
      try { parsed = new URL(proxyUrl); } catch { parsed = null; }
      if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json(
          { error: '프록시 URL 형식이 올바르지 않습니다. http(s):// 주소를 입력하세요.' },
          { status: 400 }
        );
      }
    }

    await writeGapConfig(partial);
    return NextResponse.json(await maskedView());
  } catch (err) {
    return NextResponse.json({ error: '설정 저장에 실패했습니다: ' + err.message }, { status: 500 });
  }
}
