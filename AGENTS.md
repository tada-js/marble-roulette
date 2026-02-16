# Agent Rules (Repository)

These rules are repository-level and should be applied on every thread.

## PR Title Convention

- Use `type: summary` format.
- Keep `type` lowercase.
- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `ui`.
- Example: `feat: 결과 모달 공개 플로우 개선`

## PR Body Convention

- Use this exact section order:
  - `## 변경 사항`
  - `## 검증`
- Use bullet lists under each section.
- Do not include literal escaped newline text like `\\n` in the PR body.

## Required PR Creation Method

- Do not pass multiline body as a single escaped string.
- Always use `--body-file` (or heredoc piped into a file) when running `gh pr create` / `gh pr edit`.

Recommended pattern:

```bash
cat > /tmp/pr_body.md <<'EOF'
## 변경 사항
- ...

## 검증
- npm run lint
- npm test
EOF

gh pr create --title "feat: ..." --body-file /tmp/pr_body.md
```

## Post-Create Validation

- After creating/editing PR, verify title/body formatting with:

```bash
gh pr view <number> --json title,body
```

- Confirm body contains real line breaks and no `\\n` literals.
