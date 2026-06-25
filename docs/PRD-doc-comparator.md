---
doc_id: PRD-doc-comparator
doc_type: PRD
title: 문서 비교기(Doc Comparator) 요구사항
status: draft
updated: 2026-06-25
---

# PRD — 문서 비교기 (Doc Comparator)

## 1. 개요

### 1.1 배경 / 문제
- 인허가·규격 문서는 버전 개정(이전 → 새 버전)이 잦고, 변경점을 수작업으로 대조하는 데 시간이 많이 든다.
- 단순 텍스트 diff만으로는 "무엇이 **의미상** 바뀌었고, 무엇을 **먼저 결정**해야 하는지"가 한눈에 들어오지 않는다.

### 1.2 목적
두 문서 버전을 업로드하면 **조항 단위 변경(추가/수정/삭제)을 자동 추출**하고, 그 위에 **의미 기반 갭 분석 요약**을 제공해 검토 시간을 단축한다.

### 1.3 범위
| 포함 | 제외 |
|---|---|
| 브라우저에서 DOCX/PDF/XLSX 파싱 | 서버 측 저장·처리(전면 클라이언트) |
| 조항 추출·버전 Diff·비교 뷰 | 실시간 협업/동시 편집 |
| 갭 분석 요약(사내 Claude 프록시) + MD 다운로드 | 문서 원문 보관(파싱 텍스트/결과만 보관) |
| 비교 기록 로컬 보관(localStorage) | 계정/서버 인증, 다국어 UI |

### 1.4 전제 / 제약
- 배포는 **GitHub Pages 정적 호스팅**(`output:'export'`, `basePath:'/doc-comparator'`). **서버/API 라우트 없음.**
- 모든 파싱·비교·저장은 **브라우저**에서 수행, 원본 파일은 외부로 전송하지 않는다.
- 갭 분석만 외부(사내 Claude 프록시) 호출이 필요하며, **파싱된 Diff 텍스트**만 전송한다.

## 2. 사용자 / 시나리오
- **주 사용자**: 인허가·품질·기획 담당자(문서 검토자).
- **핵심 시나리오**: 이전/새 버전 업로드 → 변경 자동 추출 → 갭 분석 요약으로 검토 방향 파악 → 조항별 상세 확인 → 요약 MD로 공유.

## 3. 기능 요구사항 (FR)

### FR-1 문서 업로드 (`/new`)
- FR-1.1 사용자는 "이전 버전"과 "새 버전" 2개 문서를 업로드한다. (클릭 선택 / 드래그앤드롭 / 전체화면 드롭 오버레이)
- FR-1.2 지원 형식: **PDF, DOCX/DOC, XLSX/XLS** (그 외 확장자는 평문으로 시도).
- FR-1.3 비교 이름을 선택 입력할 수 있다(미입력 시 `이전파일명 → 새파일명`).
- FR-1.4 "비교 시작" 시 진행 단계(파일 선택 → 파싱 → 비교 → 완료)를 표시한다.

### FR-2 파싱 (`lib/clientParser.js`)
- FR-2.1 DOCX는 raw text, PDF는 페이지별 텍스트, XLSX는 시트 텍스트로 추출한다(모두 평문 문자열).
- FR-2.2 파싱은 **브라우저에서만** 수행하며 무거운 라이브러리는 동적 import로 지연 로드한다.

### FR-3 조항 추출·비교 (`lib/diffUtils.js`)
- FR-3.1 번호 패턴(`^\d+(\.\d+)*\s+제목`) 기준으로 조항을 분해한다. 미검출 시 단락 단위(p1..p200) fallback.
- FR-3.2 같은 id 비교로 `added | modified | removed`를 판정하고, `modified`는 단어 단위 diff를 함께 생성한다.
- FR-3.3 결과는 조항 id 숫자 기준으로 정렬한다.

### FR-4 비교 뷰 (`/compare`)
- FR-4.1 헤더에 추가/수정/삭제 통계와 CSV 내보내기를 제공한다.
- FR-4.2 좌측: 조항 목록(상태 필터 전체/추가/수정/삭제 + 검색). 우측: 선택 조항의 인라인/양쪽 비교.
- FR-4.3 색상 의미 체계 고정: 추가=emerald, 수정=amber, 삭제=red.

### FR-5 갭 분석 요약 ★신규 (`lib/gapAnalysis.js` + 패널)
- FR-5.1 비교 뷰 상단 패널에서 "요약 생성"을 누르면 **현재 비교의 Diff(`cmp.diffs`)** 를 입력으로 갭 분석 요약을 생성한다. **원본 재파싱 없음**(파싱은 업로드 시 이미 완료).
- FR-5.2 호출은 **사내 Claude 프록시**(`NEXT_PUBLIC_GAP_PROXY_URL`)로 한다. 미설정 시 패널은 비활성 안내만 표시.
- FR-5.3 요약 출력 구성:
  - **한눈에 보기 표**: 조항 · 섹션 · 핵심 변경 · 유형 · 우선순위
  - **유형별 그룹**: 핵심변경 / 표현정합 / 신규 / 삭제 / 확인필요
  - **의사결정 필요** 목록 + 한 줄 요약
- FR-5.4 표/그룹 항목 클릭 시 해당 조항 Diff로 점프한다(기존 선택 상태 재사용).
- FR-5.5 결과를 **Markdown 파일로 다운로드**할 수 있다(`{비교이름}_갭분석.md`).
- FR-5.6 생성된 요약은 비교 기록에 캐시(`cmp.gapSummary`)되어 재방문 시 재호출 없이 표시된다. "재생성"으로 갱신 가능.
- FR-5.7 상태 분기: 프록시 미구성 / 생성 중 / 성공 / 오류 4가지를 모두 처리한다.

### FR-6 기록 관리 (`/`, `lib/storage.js`)
- FR-6.1 비교 기록을 localStorage에 보관하고 홈에서 목록·통계·생성일을 보여준다.
- FR-6.2 기록 보기/삭제를 지원한다. 인덱스에는 `diffs`를 저장하지 않는다.

## 4. 비기능 요구사항 (NFR)
- NFR-1 **프라이버시**: 원본 문서는 서버 비전송·비저장. 갭 분석은 파싱된 Diff 텍스트만 프록시로 전송.
- NFR-2 **보안**: 비밀/키는 클라이언트 번들에 두지 않는다. 인증은 사내 프록시(사내망/SSO)가 담당.
- NFR-3 **성능**: 무거운 파서는 지연 로드. 갭 분석 입력은 조항 본문 길이 컷·총량 상한(~24k자)으로 토큰 폭주 방지.
- NFR-4 **정적 배포 유지**: 서버 의존 코드 금지(`npm run build` 정적 export가 깨지지 않아야 함).
- NFR-5 **호환성**: localStorage 스키마는 추가형 확장만(기존 데이터 호환).

## 5. 데이터 모델 (요약)
```js
Clause = { id, title, content }
Diff   = { id, title, status:'added'|'modified'|'removed', oldTitle?, oldContent, newContent, diff }
Stored = { id, name, oldFileName, newFileName, stats:{added,modified,removed}, createdAt, diffs, gapSummary? }
GapSummary = {
  oneLine, overview:[{clauseId,section,change,type,priority}],
  groups:{핵심변경,표현정합,신규,삭제,확인필요}, decisions:[], generatedAt, model
}
```
> 갭 분석 프롬프트·출력 스키마의 단일 출처: `docs/gap-analysis-agent.md`

## 6. 의존 / 외부 연동
- **사내 Claude 프록시** (사용자 확정 필요): 엔드포인트 URL, 인증/CORS 정책(GitHub Pages origin + `localhost:3000` 허용), 노출 모델 ID, 요청/응답 포맷(Anthropic Messages 호환 가정), `max_tokens`·rate limit.
- 환경변수: `NEXT_PUBLIC_GAP_PROXY_URL`, `NEXT_PUBLIC_GAP_MODEL` — 로컬 `.env.local` + 배포 워크플로(`deploy.yml`)에 설정.

## 7. 성공 기준
- 두 문서 업로드 → 비교 뷰 진입까지 수동 대조 없이 완료.
- 갭 분석 요약이 변경 유형·우선순위·의사결정 항목을 표로 제시하고, 항목 클릭으로 근거 조항에 도달.
- 요약을 MD로 내보내 공유 가능.
- `npm run build` 정적 export 무결.

## 8. 미결 사항 (OQ) / 리스크
- OQ-1 사내 프록시 인증 방식(사내망/SSO vs 단기 토큰)과 CORS 허용 origin 확정.
- OQ-2 PDF 파싱 품질: `pdfjs`가 텍스트를 공백 join → 조항 번호 미검출 시 단락 fallback으로 분석 정밀도 저하. (별도 개선 과제, 신뢰도 배지 등)
- RISK-1 입력이 매우 큰 문서일 때 토큰 비용/지연 — 길이 컷·상한으로 1차 완화, 청크 전략은 후속.
- DEC-1 산출물 범위: **화면 요약 패널 + MD 다운로드**로 확정(이번 범위).
