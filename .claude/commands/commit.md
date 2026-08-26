## Git Commit Guidelines

This project follows Conventional Commits with AI-assisted message generation. For full details, see `docs/GIT_COMMIT_GUIDELINES.md`.

### Quick Format
```
<emoji> <type>(<scope>): <description> (#<issue-number>)
```

### Key Rules
1. **Language**: Japanese (technical terms in English OK)
2. **Issue Linking**: REQUIRED for all issue-related commits
3. **AI Tools**: Use AI for message generation (Cursor, VSCode, gemini-cli, opencommit)
4. **Focus**: Explain "why" not just "what"

### Common Types & Emojis
- ✨ `feat`: New feature
- 🐛 `fix`: Bug fix
- 📝 `docs`: Documentation
- ♻️ `refactor`: Code refactoring
- ✅ `test`: Tests

### Scopes
`fire`, `auto`, `pet`, `ui`, `header`, `media`, `design-system`

### Examples
```
✨ feat(pet): 保険料計算に年齢割引機能を追加 (#234)
🐛 fix(ui): モーダルのESCキー閉じが動作しない問題を修正 (#567)
```

### AI-Assisted Commit
```bash
# Cursor/Claude Code - Automatic
# VSCode - Use Conventional Commits extension
# gemini-cli
gemini -p "Create commit message" -f git diff --cached
# opencommit
oco
```
