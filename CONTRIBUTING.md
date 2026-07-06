# Contributing

This project is intentionally small. V1 is a CLI-first local artifact protocol for narrated macOS screen demonstrations.

Keep changes aligned with these constraints:

- Prefer native macOS Screenshot.app behavior over custom recording UI.
- Keep the public command surface small.
- Do not add MCP, cloud upload, streaming, frame sampling, or video intelligence without opening an issue first.
- Treat narration/transcription as the core value proposition.
- Keep generated captures, model files, virtualenvs, and media out of git.

Before opening a PR:

```sh
npm install
npm test
npm pack --dry-run
```

Real recording behavior still requires human validation on macOS.
