---
description: Use when a UI bug is hard to understand from text, a previous attempted fix failed, or the user can demonstrate the issue faster than describing it. Guides Claude to request a narrated atsc capture and consume the resulting artifacts.
---

# Narrated Bug Capture

Use this workflow only when it materially reduces ambiguity. Do not ask for a capture for simple code errors, obvious test failures, or issues you can diagnose directly from logs, tests, or source.

Ask for a narrated capture when:

- the user reports a visual, interaction-heavy, timing-sensitive, or stateful UI bug
- one or more attempted fixes did not resolve the user's reported behavior
- the user can demonstrate the bug more clearly than they can describe it
- screenshots or text feedback are insufficient

Before launching capture, tell the user exactly what to narrate:

```text
I need a concrete reproduction. I am going to launch a local screen capture helper. Please demonstrate the bug and narrate what you are doing: what you expected, what actually happened, and the exact moment the bug appears. When you are done, stop the native macOS recording.
```

Then run:

```sh
atsc doctor
atsc capture
```

After the recording completes, run:

```sh
atsc prepare
```

Use the prepared JSON as the primary context. Read the transcript first, then inspect `manifest.json`. Use `recording.mov` only if visual details are still needed and the current environment can inspect video.

Before changing code, briefly restate what the capture showed and what you are going to fix.

If transcription is missing or failed, read the manifest error and ask one focused follow-up question instead of guessing.
