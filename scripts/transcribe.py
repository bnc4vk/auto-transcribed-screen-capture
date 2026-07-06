#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper.")
    parser.add_argument("audio_path")
    parser.add_argument("transcript_path")
    parser.add_argument("--model", default="base.en")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Missing faster_whisper. Run: npm run build && atsc setup-transcriber", file=sys.stderr)
        return 2

    model = WhisperModel(args.model, device="auto", compute_type="default")
    segments, _info = model.transcribe(args.audio_path, beam_size=1, vad_filter=False)
    lines = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            lines.append(text)
    transcript = "\n".join(lines).strip()
    if transcript:
        transcript += "\n"
    Path(args.transcript_path).write_text(transcript, encoding="utf-8")
    print(transcript, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
