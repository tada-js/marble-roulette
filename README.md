# 데구르르 (Degururu)

동물 공(기본: 강아지/토끼/햄스터)이 핀볼 보드의 핀(peg)을 튕기며 아래 슬롯으로 떨어지는 "사다리" 스타일의 데구르르 게임입니다.

## Features

- 기본 공: 강아지 / 토끼 / 햄스터
- 공별 이름/이미지 커스터마이즈(업로드, 로컬 저장)
- 보드 클릭으로 드롭 위치 지정, `DROP` 버튼으로 공 한 번에 동시에 떨어뜨리기
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

Vite 기반 점진 마이그레이션(1단계) 개발 서버:

```bash
npm run dev:vite
```

브라우저에서 `http://localhost:5173` 접속.

## Tests

```bash
npm test
npm run lint
npm run build:vite
```

## GitHub Flow

- `main`: 배포/릴리즈 기준
- 작업은 `codex/<topic>` 또는 `feature/<topic>` 브랜치 생성
- PR로 `main`에 머지 (CodeRabbit 리뷰 활용)
