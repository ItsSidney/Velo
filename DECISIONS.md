# DECISIONS.md

## Assumptions
- Modes reduced to Chat and Coder.
- Theme: Velo Mono white/black with red accent (#FF3B30) for velocity.
- History stored in localStorage with paging (8 per page); no backend DB.
- Markdown rendering with react-markdown + remark-gfm + prism-react-renderer.
- Coder mode sends a system prompt to shape responses.
- Groq default model updated to openai/gpt-oss-20b (available on free tier).
- No auth, no tools, no RAG, no branching/compare/canvas yet.