# Contributing (GitHub Flow)

1. `main`에서 브랜치 생성: `feature/<topic>`
2. 커밋 후 PR 생성 (Draft가 아니게)
3. 자동 리뷰(`senior-review`)와 CI(`ci`) 체크 통과 확인
4. CodeRabbit 리뷰 확인 후 필요한 수정 반영
5. 기본적으로 `main` 대상 PR은 auto-merge(squash)가 자동 활성화됨

## PR 컨벤션

- 제목 형식: `type: summary`
- `type`은 소문자 사용 (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `ui`)
- 본문 섹션 순서:
  - `## 변경 사항`
  - `## 검증`
- 본문에 `\n` 같은 이스케이프 문자열이 그대로 들어가면 안 됨

### PR 본문 작성 방법 (필수)

- `gh pr create --body "..."` 형태로 이스케이프 문자열을 넣지 말고, 항상 `--body-file` 사용

예시:

```bash
cat > /tmp/pr_body.md <<'EOF'
## 변경 사항
- ...

## 검증
- npm run typecheck
- npm run lint
- npm test
EOF

gh pr create --title "feat: ..." --body-file /tmp/pr_body.md
```
