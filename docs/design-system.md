# Design System (v1)

이 프로젝트의 UI는 React 컴포넌트 + CSS 토큰 기반으로 관리합니다.

## 목표

- 공통 컴포넌트(버튼/모달/폼)의 일관된 크기와 상호작용
- 색상/간격/모션 토큰 중심의 유지보수
- 기능 리팩터링 시 UI 회귀 최소화

## 토큰

`styles.css`의 `:root`에서 관리합니다.

- `--ctrl-h-sm`, `--ctrl-h-md`, `--ctrl-h-lg`: 컨트롤 높이
- `--ctrl-px-sm`, `--ctrl-px-md`, `--ctrl-px-lg`: 컨트롤 가로 패딩
- `--ring`: 포커스 링 색상
- `--motion-fast`: 인터랙션 전환 시간

## 컴포넌트

- `Button`, `IconButton`
  - 파일: `src/ui-react/components/button.tsx`
  - variant: `primary | ghost | danger | accent`
  - size: `sm | md | lg`
- `ModalCard`
  - 파일: `src/ui-react/components/modal.tsx`
  - 헤더/본문/푸터/닫기 버튼을 공통 구조로 제공

## Storybook

- 설정 경로: `.storybook/`
- 실행: `npm run storybook`
- 확인 대상 스토리:
  - `Design System/Button`
  - `Design System/ModalCard`
  - `Design System/Tokens`

## 스타일 규칙

- 모든 클릭 가능한 컨트롤은 hover/focus/active 상태를 가져야 함
- 포커스 스타일은 `--ring` 기반으로 통일
- 신규 버튼은 가능한 `Button`/`IconButton` 재사용
- 신규 모달은 `ModalCard` 재사용

## 확장 우선순위

1. `Input`, `Textarea`, `Toggle`를 React 컴포넌트로 분리
2. 카드/패널 컴포넌트(`Card`, `Panel`) 도입
3. 디자인 토큰을 `styles.css`에서 별도 파일로 분리
