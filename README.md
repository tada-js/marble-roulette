# 데구르르 (Degururu)

동물 공(기본: 강아지/토끼/햄스터)이 핀볼 보드의 핀(peg)을 튕기며 아래 슬롯으로 떨어지는 "사다리" 스타일의 데구르르 게임입니다.

## Features

- 기본 공: 강아지 / 토끼 / 햄스터
- UI/엔진/렌더 레이어: TypeScript 기반
- 공별 이름/이미지 커스터마이즈(업로드, 로컬 저장)
- `게임 시작`으로 선택된 공 전체 동시 투하
- `일시정지/이어하기`, 시점 고정/자유 시점 전환
- 당첨자: 가장 늦게 바닥(슬롯)에 도착한 공
- `window.render_game_to_text()` / `window.advanceTime(ms)` 제공(자동화 테스트 용이)

## Local Dev

```bash
# repo root에서 실행
cd degururu
npm ci
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.
`npm run dev`는 Vite + React/TypeScript로 실행됩니다.

문의 메일 전송(서버 API) 설정:

```bash
cp .env.example .env.local
# .env.local에 실제 값을 입력
```

필수 환경변수:
- `INQUIRY_TO_EMAIL`: 문의 수신 주소
- `RESEND_API_KEY`: Resend API 키
- `INQUIRY_FROM_EMAIL`: 발신 주소(검증 도메인 권장)

## Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build:vite
```

## Deploy (Vercel)

### 1) 로컬 검증

```bash
npm ci
npm run typecheck
npm run lint
npm test --silent
npm run build:vite
```

### 2) Vercel 환경변수 설정

Vercel Project Settings > Environment Variables에 아래 값을 등록하세요.

- `INQUIRY_TO_EMAIL`
- `RESEND_API_KEY`
- `INQUIRY_FROM_EMAIL`
- `INQUIRY_ALLOWED_ORIGINS` (예: `https://your-domain.com,https://www.your-domain.com`)

### 3) Preview 배포

```bash
vercel deploy -y
```

### 4) Production 배포

```bash
vercel deploy --prod -y
```

### 5) 점검 포인트

- `/api/inquiry`가 200/4xx/5xx를 의도대로 반환하는지 확인
- 브라우저 Network 탭에서 API 키/수신 이메일이 클라이언트로 내려오지 않는지 확인
- `INQUIRY_ALLOWED_ORIGINS`에 운영 도메인만 등록했는지 확인

## Storybook

```bash
npm run storybook
```

- 기본 주소: `http://localhost:6006`
- 디자인 시스템 스토리:
  - `Design System/Button`
  - `Design System/ModalCard`
  - `Design System/Tokens`

## Design System

- 가이드: `docs/design-system.md`
- 공통 UI 컴포넌트: `src/ui-react/components`

## GitHub Flow

- `main`: 배포/릴리즈 기준
- 작업은 `feature/<topic>` 브랜치 생성
- PR로 `main`에 머지 (CodeRabbit 리뷰 활용)
