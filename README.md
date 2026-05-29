# 62366 Doc Comparator

문서 비교와 ONLYOFFICE 원문 뷰어가 함께 들어 있는 Next.js 앱입니다.

## 실행

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 설정

`.env.local` 파일에 아래 값을 넣습니다.

```bash
DOCLING_SERVICE_URL=http://localhost:8080
ONLYOFFICE_DOCUMENT_SERVER_URL=http://localhost:8081
ONLYOFFICE_APP_PUBLIC_URL=http://host.docker.internal:3000
```

- `ONLYOFFICE_DOCUMENT_SERVER_URL`: 브라우저가 접속할 DocumentServer 주소
- `ONLYOFFICE_APP_PUBLIC_URL`: Docker 안의 DocumentServer가 이 앱의 업로드 문서를 다시 가져올 때 사용할 앱 주소
- macOS/Windows Docker Desktop 기준으로 `host.docker.internal`을 사용했습니다. Linux에서는 호스트에 도달 가능한 주소로 바꿔야 합니다.

3. ONLYOFFICE DocumentServer 실행

```bash
npm run onlyoffice:start
```

로컬 개발 환경에서는 DocumentServer가 private IP 대역으로의 다운로드를 기본 차단할 수 있습니다.
이 저장소의 `docker-compose.onlyoffice.yml`에는 아래 환경 변수가 포함되어 있으며,
문서 로딩 중 `다운로드하지 못했습니다.` 팝업이 뜰 때 먼저 이 설정과 컨테이너 재기동 여부를 확인하세요.

- `ALLOW_PRIVATE_IP_ADDRESS=true`
- `ALLOW_META_IP_ADDRESS=true`

Docker가 설치되어 있지 않다면 먼저 Docker Desktop 또는 Docker Engine을 설치해야 합니다.

4. 앱 실행

```bash
npm run dev
```

Docling까지 같이 실행하려면:

```bash
npm run dev:full
```

## ONLYOFFICE 통합 방식

- 비교 생성 시 업로드한 원본 문서를 서버의 `.data/documents` 아래에 저장합니다.
- 비교 결과 화면에서 `원문 보기`를 누르면 `/viewer/[documentId]` 페이지로 이동합니다.
- 뷰어 페이지는 `/api/documents/[id]/config`에서 ONLYOFFICE 설정을 받아 read-only 모드로 문서를 엽니다.
- 문서 원본은 `/api/documents/[id]/content`로 제공됩니다.

## 개발 메모

- 현재 저장소 `.data/`는 로컬 개발용 업로드 저장소이며 Git에는 포함되지 않습니다.
- 기본 Docker compose 설정은 `docker-compose.onlyoffice.yml`에 있습니다.
