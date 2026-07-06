# Auto-Transcribed Screen Capture for Claude Code

This Claude Code plugin teaches Claude when and how to use the `atsc` CLI for narrated macOS screen demonstrations.

It does not bundle a recorder or MCP server. Install the CLI separately so `atsc` is available on `PATH`.

```sh
npm install -g github:bnc4vk/auto-transcribed-screen-capture
atsc setup-transcriber
```

Test locally:

```sh
claude --plugin-dir ./plugins/claude-code/auto-transcribed-screen-capture
```

The skill is available as `/auto-transcribed-screen-capture:narrated-bug-capture`.
