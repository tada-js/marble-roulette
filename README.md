# 데구르르 (Degururu)

동물 공(기본: 강아지/토끼/햄스터)이 핀볼 보드의 핀(peg)을 튕기며 아래 슬롯으로 떨어지는 "사다리" 스타일의 데구르르 게임입니다.

## Features

- 기본 공: 강아지 / 토끼 / 햄스터
- UI 레이어: React + TypeScript 기반(엔진/렌더는 기존 JS 유지)
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
`npm run dev`는 Vite + React/TypeScript UI 셸(엔진/렌더는 기존 JS 유지)로 실행됩니다.

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

## GitHub Flow

- `main`: 배포/릴리즈 기준
- 작업은 `feature/<topic>` 브랜치 생성
- PR로 `main`에 머지 (CodeRabbit 리뷰 활용)
