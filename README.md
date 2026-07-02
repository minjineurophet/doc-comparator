# Doc Comparator

문서 비교와 ONLYOFFICE 원문 뷰어가 함께 들어 있는 Next.js 앱입니다.
**Desktop-Apps 브랜치**에서는 Electron을 사용해 Mac(`.dmg`)과 Windows(`.exe`) 설치 파일로 빌드할 수 있습니다.

## 데스크톱 앱 빌드 (Electron)

> Mac 또는 Windows에서 설치해서 사용할 수 있는 응용 프로그램으로 패키징합니다.

### 사전 요구사항

- Node.js 18 이상
- (Mac 배포용) Xcode Command Line Tools

### 빌드

```bash
# 1. 의존성 설치
npm install

# 2. Next.js 빌드 → standalone 패키징 → 설치 파일 생성
npm run electron:build
```

빌드 완료 후 `dist/` 폴더에 설치 파일이 생성됩니다:
- **Mac**: `dist/Doc Comparator-{version}-arm64.dmg` (Apple Silicon 전용)
- **Windows**: `dist/Doc Comparator Setup {version}.exe`

### ⚠️ macOS 최초 실행 (중요)

이 앱은 Apple Developer 인증서로 서명·공증(notarize)되지 않은 **사내 배포용 ad-hoc 서명** 앱입니다.
Apple Silicon(macOS)은 유효한 서명이 없으면 실행 자체를 차단하므로, 빌드 시 electron-builder가
자동으로 **ad-hoc 서명**을 적용합니다(`scripts/afterPack.cjs`).

다만 인터넷에서 다운로드한 `.dmg`는 macOS가 격리(quarantine) 속성을 붙이기 때문에, 첫 실행 시
**"'Doc Comparator'은(는) 손상되었기 때문에 열 수 없습니다"** 경고가 뜹니다. **최초 1회** 아래 명령으로
격리 속성을 제거하면 정상 실행됩니다:

```bash
# 앱을 Applications(또는 원하는 위치)로 옮긴 뒤 실행
xattr -cr "/Applications/Doc Comparator.app"
```

> ⚠️ **"손상됨" 경고는 우클릭 → 열기로는 해제되지 않습니다.** 반드시 위 `xattr -cr` 명령을 사용하세요.
> ("확인되지 않은 개발자" 경고와 달리, ad-hoc 서명 앱의 "손상됨" 경고는 격리 속성 제거가 유일한 방법입니다.)
> (경고 없이 실행하려면 Apple Developer ID 서명 + 공증이 필요합니다.)

### 개발 모드 (Electron)

```bash
# 터미널 1: Next.js 개발 서버 실행
npm run dev

# 터미널 2: Electron 창 열기 (Next.js dev server에 연결)
npm run electron:dev
```

### 패키지 구조 (빌드 결과물)

```
설치된 앱
├── electron/main.js        ← Electron 메인 프로세스
├── electron/preload.js     ← 보안 preload
└── resources/next-server/  ← Next.js standalone 서버 (번들)
```

업로드한 문서와 비교 결과물은 OS의 앱 데이터 폴더에 저장됩니다:
- **Mac**: `~/Library/Application Support/Doc Comparator/`
- **Windows**: `%APPDATA%\Doc Comparator\`

---

## 웹 앱으로 실행 (기존 방식)

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
