#!/usr/bin/env node
import { atscHome, captureDemo, displayPath, doctor, listCaptures, prepareCapture, readLatest, setupTranscriber, } from "./core.js";
async function main() {
    const [command, ...argv] = process.argv.slice(2);
    if (!command || command === "--help" || command === "-h")
        return printHelp();
    try {
        switch (command) {
            case "capture":
                return await cmdCapture(parse(argv));
            case "prepare":
                return cmdPrepare(parse(argv));
            case "list":
                return cmdList();
            case "latest":
                return cmdLatest();
            case "doctor":
                return cmdDoctor();
            case "setup-transcriber":
                setupTranscriber();
                console.log(`Installed faster-whisper into ${atscHome}/.venv`);
                return;
            default:
                throw new Error(`Unknown command "${command}". Run atsc --help.`);
        }
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
function parse(argv) {
    const positional = [];
    const flags = new Map();
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            positional.push(arg);
            continue;
        }
        const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
        if (inlineValue !== undefined) {
            flags.set(rawKey, inlineValue);
        }
        else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
            flags.set(rawKey, argv[i + 1]);
            i += 1;
        }
        else {
            flags.set(rawKey, true);
        }
    }
    return { positional, flags };
}
function getFlag(parsed, name) {
    const value = parsed.flags.get(name);
    if (typeof value === "string")
        return value;
    return undefined;
}
function hasFlag(parsed, name) {
    return parsed.flags.get(name) === true;
}
async function cmdCapture(parsed) {
    const allowedFlags = new Set(["no-transcript"]);
    for (const flag of parsed.flags.keys()) {
        if (!allowedFlags.has(flag)) {
            throw new Error(`Unknown capture flag "--${flag}". The only capture flag is --no-transcript.`);
        }
    }
    if (parsed.positional.length > 0) {
        throw new Error("Usage: atsc capture [--no-transcript]");
    }
    const result = await captureDemo({
        noTranscript: hasFlag(parsed, "no-transcript"),
        dryRun: process.env.ATSC_DRY_RUN === "1"
    });
    console.log(`capture: ${result.manifest.captureId}`);
    console.log(`dir: ${displayPath(result.captureDir)}`);
    console.log(`recording: ${displayPath(result.manifest.recordingPath)}`);
    if (result.manifest.audioPath)
        console.log(`audio: ${displayPath(result.manifest.audioPath)}`);
    if (result.manifest.transcriptPath)
        console.log(`transcript: ${displayPath(result.manifest.transcriptPath)}`);
    if (process.env.ATSC_DRY_RUN === "1")
        console.log(`command: ${result.command.map(quoteArg).join(" ")}`);
    if (result.manifest.errors.length > 0) {
        console.log("\nWarnings:");
        for (const error of result.manifest.errors)
            console.log(`- ${error}`);
    }
    if (result.transcript) {
        console.log("\nTranscript:");
        process.stdout.write(result.transcript);
        if (!result.transcript.endsWith("\n"))
            process.stdout.write("\n");
    }
}
function cmdPrepare(parsed) {
    const input = parsed.positional[0];
    const context = prepareCapture(input);
    console.log(JSON.stringify(context, null, 2));
}
function cmdList() {
    console.log(JSON.stringify(listCaptures(), null, 2));
}
function cmdLatest() {
    console.log(JSON.stringify(readLatest(), null, 2));
}
function cmdDoctor() {
    const report = doctor();
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length > 0)
        process.exitCode = 1;
}
function printHelp() {
    console.log(`atsc - narrated screen capture for coding agents

Usage:
  atsc capture [--no-transcript]
  atsc latest
  atsc prepare [capture-id-or-path]
  atsc doctor

Commands:
  capture                Start native macOS Screenshot recording,
                         then extract narration, transcribe, and write manifest.
  latest                 Print the latest capture pointer from ~/.atsc/latest.json.
  prepare                Print agent-ready JSON context for a capture.
  list                   List capture manifests.
  doctor                 Check Screenshot save location, local tools, and transcriber setup.
  setup-transcriber      Create ~/.atsc/.venv and install faster-whisper.

Capture flag:
  --no-transcript        Skip local transcription only when narration is not needed.`);
}
function quoteArg(arg) {
    return /[\s"'$]/.test(arg) ? JSON.stringify(arg) : arg;
}
void main();
