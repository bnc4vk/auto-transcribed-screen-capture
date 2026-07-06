# Security

`atsc` is a local-only tool. It launches the native macOS Screenshot app, watches the configured Screenshot save folder for a new `.mov`, then moves local artifacts under `~/.atsc`.

Do not use this tool to record private, confidential, or regulated data unless you understand where the artifacts are stored and who can access the machine.

Report security concerns by opening a private advisory on GitHub if available, or by contacting the repository owner.

Generated artifacts may contain sensitive screen contents and narration:

```text
~/.atsc/captures/
~/.atsc/latest.json
```

Delete those files manually when they are no longer needed.
