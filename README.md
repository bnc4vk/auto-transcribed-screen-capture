# Auto-Transcribed Screen Capture

`atsc` is a minimal local CLI for narrated macOS screen demonstrations. It helps a human show a difficult UI bug to a coding agent without relying on undocumented video/audio ingestion behavior.

The intended workflow is simple:

1. A coding agent asks the user for a narrated demonstration when text feedback is not enough.
2. `atsc capture` launches the native macOS Screenshot recorder.
3. The user records the focused behavior and narrates what they expected, what happened, and when the bug appears.
4. `atsc` saves explicit local artifacts that any coding agent can read.

## Artifacts

By default, artifacts are stored outside the source checkout:

```text
~/.atsc/
├── latest.json
└── captures/
    └── <timestamp-slug>/
        ├── recording.mov
        ├── audio.wav
        ├── transcript.txt
        └── manifest.json
```

Set `ATSC_HOME=/some/path` to use a different artifact root.

## Requirements

- macOS with the native Screenshot app
- Node.js 20+
- `afconvert` for local audio extraction, or `ffmpeg` if already installed
- Python 3 for local transcription setup

The capture command launches the same native app as Cmd+Shift+5:

```sh
open -a Screenshot
```

## Install

From npm, after the package is published:

```sh
npm install -g auto-transcribed-screen-capture
atsc setup-transcriber
```

From GitHub:

```sh
npm install -g github:bnc4vk/auto-transcribed-screen-capture
atsc setup-transcriber
```

For local development:

```sh
npm install
npm run build
npm run setup-transcriber
```

`setup-transcriber` creates `~/.atsc/.venv/` and installs `faster-whisper`. Models are downloaded by faster-whisper on first use.

## Check Setup

```sh
npm exec -- atsc doctor
```

`doctor` checks the Screenshot save location, required local tools, and transcriber setup.

Before recording, set the Screenshot toolbar's save location to a folder. `atsc` reads that configured folder at startup and assumes the recording will be saved there for this capture. Do not switch the save location after launching `atsc capture`.

macOS may prompt for:

- Screen Recording permission for the terminal app running `atsc`
- Microphone permission if you choose a microphone in the native Screenshot Options menu

## Capture

```sh
npm exec -- atsc capture
```

When the Screenshot toolbar appears, choose a focused region, choose a microphone from Options if narration is needed, and narrate the bug while recording:

- what you are trying to do
- what you expected to happen
- what actually happened
- the moment the bug appears
- any relevant timing or repeated steps

After the `.mov` is saved, `atsc` moves it into `~/.atsc/captures/<id>/recording.mov`, extracts audio, transcribes the narration, and writes `manifest.json`.

Skip transcription only when you intentionally do not need narration:

```sh
npm exec -- atsc capture --no-transcript
```

If transcription fails, the recording and manifest are still kept. The error is written into `manifest.json`.

## Agent Commands

Print the latest capture pointer:

```sh
npm exec -- atsc latest
```

Prepare agent-readable context for the latest capture:

```sh
npm exec -- atsc prepare
```

Prepare a specific capture by id or path:

```sh
npm exec -- atsc prepare <capture-id-or-path>
```

List captures:

```sh
npm exec -- atsc list
```

## Example Agent Prompt

```text
The previous fix did not resolve the UI bug. Please run `atsc capture` and ask me to narrate a focused reproduction: what I expected, what actually happened, and when the bug appears. After I stop the native macOS recording, run `atsc prepare`, inspect the transcript and manifest, then use the raw recording path if visual details are needed.
```

## Agent Integrations

This repository includes thin workflow plugins for coding agents. They do not add another runtime layer; they teach the agent when to request a narrated capture and how to consume `atsc prepare`.

Codex local marketplace:

```sh
codex plugin marketplace add .
```

Claude Code marketplace:

```sh
/plugin marketplace add bnc4vk/auto-transcribed-screen-capture
/plugin install auto-transcribed-screen-capture@auto-transcribed-screen-capture
```

Claude Code local test:

```sh
claude --plugin-dir ./plugins/claude-code/auto-transcribed-screen-capture
```

Install the CLI separately before using either integration:

```sh
npm install -g github:bnc4vk/auto-transcribed-screen-capture
atsc setup-transcriber
```

## Tests

```sh
npm test
```

The smoke tests verify CLI launch and command handling. They do not attempt a real screen recording because region selection and narration require human interaction.
