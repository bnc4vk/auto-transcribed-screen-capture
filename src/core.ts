import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Manifest = {
  captureId: string;
  createdAt: string;
  recordingPath: string;
  audioPath?: string;
  transcriptPath?: string;
  durationSeconds?: number;
  errors: string[];
  fallbacks: string[];
};

export type LatestCapture = {
  captureId: string;
  captureDir: string;
  manifestPath: string;
  recordingPath: string;
  audioPath?: string;
  transcriptPath?: string;
  updatedAt: string;
};

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const atscHome = resolveHome(process.env.ATSC_HOME?.trim() || "~/.atsc");
export const capturesRoot = join(atscHome, "captures");
export const latestPath = join(atscHome, "latest.json");
const scriptsRoot = join(projectRoot, "scripts");

export function commandExists(command: string): boolean {
  return spawnSync("which", [command], { encoding: "utf8" }).status === 0;
}

export function run(command: string, args: string[], options: { cwd?: string } = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export function timestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function createCapture(): { captureId: string; captureDir: string; recordingPath: string; manifest: Manifest } {
  mkdirSync(atscHome, { recursive: true });
  mkdirSync(capturesRoot, { recursive: true });
  let captureId = timestampSlug();
  let captureDir = join(capturesRoot, captureId);
  let counter = 2;
  while (existsSync(captureDir)) {
    captureId = `${timestampSlug()}-${counter}`;
    captureDir = join(capturesRoot, captureId);
    counter += 1;
  }
  mkdirSync(captureDir, { recursive: true });
  const recordingPath = join(captureDir, "recording.mov");
  const manifest: Manifest = {
    captureId,
    createdAt: new Date().toISOString(),
    recordingPath,
    errors: [],
    fallbacks: []
  };
  writeManifest(captureDir, manifest);
  writeLatest(captureDir, manifest);
  return { captureId, captureDir, recordingPath, manifest };
}

export function resolveInputCapture(input: string): { captureDir: string; recordingPath: string; manifestPath: string } {
  const absolute = resolveCaptureDirOrPath(input);
  const stats = statSync(absolute);
  const captureDir = stats.isDirectory() ? absolute : dirname(absolute);
  const recordingPath = stats.isDirectory() ? join(absolute, "recording.mov") : absolute;
  return { captureDir, recordingPath, manifestPath: join(captureDir, "manifest.json") };
}

export function readManifest(captureDir: string): Manifest {
  const manifestPath = join(captureDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    const captureId = basename(captureDir);
    return {
      captureId,
      createdAt: new Date(statSync(captureDir).birthtimeMs).toISOString(),
      recordingPath: join(captureDir, "recording.mov"),
      errors: [],
      fallbacks: []
    };
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

export function writeManifest(captureDir: string, manifest: Manifest): void {
  writeFileSync(join(captureDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function updateManifest(captureDir: string, update: Partial<Manifest>): Manifest {
  const current = readManifest(captureDir);
  const merged: Manifest = {
    ...current,
    ...update,
    errors: [...(current.errors ?? []), ...(update.errors ?? [])],
    fallbacks: [...(current.fallbacks ?? []), ...(update.fallbacks ?? [])]
  };
  writeManifest(captureDir, merged);
  writeLatest(captureDir, merged);
  return merged;
}

export function readLatest(): LatestCapture {
  if (!existsSync(latestPath)) throw new Error(`No latest capture pointer found at ${latestPath}`);
  return JSON.parse(readFileSync(latestPath, "utf8")) as LatestCapture;
}

export function writeLatest(captureDir: string, manifest: Manifest): void {
  mkdirSync(atscHome, { recursive: true });
  const latest: LatestCapture = {
    captureId: manifest.captureId,
    captureDir,
    manifestPath: join(captureDir, "manifest.json"),
    recordingPath: manifest.recordingPath,
    audioPath: manifest.audioPath,
    transcriptPath: manifest.transcriptPath,
    updatedAt: new Date().toISOString()
  };
  writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`);
}

export async function recordScreen(options: {
  dryRun?: boolean;
} = {}): Promise<{ captureDir: string; manifest: Manifest; command: string[] }> {
  if (!commandExists("open")) {
    throw new Error("open is not available on this machine.");
  }
  const { captureDir, recordingPath, manifest } = createCapture();
  const args = ["-a", "Screenshot"];

  if (options.dryRun) {
    updateManifest(captureDir, {
      fallbacks: [
        "record command was dry-run; no recording created",
        "Screenshot.app controls region bounds, microphone input, and save location"
      ]
    });
    return { captureDir, manifest: readManifest(captureDir), command: ["open", ...args] };
  }

  const searchDir = getScreenshotSaveDir();
  const startedAt = Date.now();
  const before = snapshotMovFiles(searchDir);
  const status = await new Promise<number>((resolvePromise, reject) => {
    const child = spawn("open", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => resolvePromise(code ?? 1));
  });
  if (status !== 0) {
    updateManifest(captureDir, { errors: [`open -a Screenshot exited with status ${status}`] });
    throw new Error(`open -a Screenshot exited with status ${status}`);
  }
  const capturedMov = await waitForNewStableMov(searchDir, before, startedAt);
  renameSync(capturedMov, recordingPath);
  const info = getMediaInfo(recordingPath);
  const updated = updateManifest(captureDir, {
    durationSeconds: info.durationSeconds,
    errors: info.errors,
    fallbacks: [
      ...info.fallbacks,
      "launched Screenshot.app; microphone input is controlled by the native Options menu"
    ]
  });
  return { captureDir, manifest: updated, command: ["open", ...args] };
}

export async function captureDemo(options: {
  noTranscript?: boolean;
  dryRun?: boolean;
} = {}): Promise<{ captureDir: string; manifest: Manifest; transcript?: string; command: string[] }> {
  const recorded = await recordScreen({ dryRun: options.dryRun });
  if (options.dryRun) {
    return { ...recorded, transcript: undefined };
  }

  let manifest = extractAudio(recorded.captureDir);

  if (options.noTranscript) {
    manifest = updateManifest(recorded.captureDir, {
      fallbacks: ["transcription skipped by --no-transcript"]
    });
    return { ...recorded, manifest, transcript: undefined };
  }

  try {
    const result = transcribe(recorded.captureDir);
    return { ...recorded, manifest: result.manifest, transcript: result.transcript };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manifest = updateManifest(recorded.captureDir, {
      errors: [`transcription failed: ${message}`]
    });
    return { ...recorded, manifest, transcript: undefined };
  }
}

export function extractAudio(input: string): Manifest {
  const { captureDir, recordingPath } = resolveInputCapture(input);
  if (!existsSync(recordingPath)) throw new Error(`Recording not found: ${recordingPath}`);

  const errors: string[] = [];
  const fallbacks: string[] = [];
  let audioPath = join(captureDir, "audio.wav");

  if (commandExists("ffmpeg")) {
    const result = run("ffmpeg", ["-y", "-i", recordingPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", audioPath]);
    if (result.status !== 0) {
      errors.push(`ffmpeg audio extraction failed: ${trimToolError(result.stderr)}`);
    }
  } else if (commandExists("afconvert")) {
    fallbacks.push("ffmpeg not installed; used afconvert for audio extraction");
    const result = run("afconvert", [recordingPath, audioPath, "-f", "WAVE", "-d", "LEI16@16000", "-c", "1"]);
    if (result.status !== 0) {
      errors.push(`afconvert audio extraction failed: ${trimToolError(result.stderr)}`);
    }
  } else {
    errors.push("Neither ffmpeg nor afconvert is available for audio extraction.");
  }

  if (!existsSync(audioPath)) {
    audioPath = join(captureDir, "audio.m4a");
    if (commandExists("ffmpeg")) {
      const result = run("ffmpeg", ["-y", "-i", recordingPath, "-vn", "-c:a", "aac", audioPath]);
      if (result.status !== 0) errors.push(`ffmpeg m4a fallback failed: ${trimToolError(result.stderr)}`);
    } else if (commandExists("afconvert")) {
      const result = run("afconvert", [recordingPath, audioPath, "-f", "m4af", "-d", "aac"]);
      if (result.status !== 0) errors.push(`afconvert m4a fallback failed: ${trimToolError(result.stderr)}`);
    }
  }

  const info = getMediaInfo(recordingPath);
  return updateManifest(captureDir, {
    audioPath: existsSync(audioPath) ? audioPath : undefined,
    durationSeconds: info.durationSeconds,
    errors: [...errors, ...info.errors],
    fallbacks: [...fallbacks, ...info.fallbacks]
  });
}

export function transcribe(input: string, model = "base.en"): { manifest: Manifest; transcript: string } {
  const { captureDir } = resolveInputCapture(input);
  let manifest = readManifest(captureDir);
  if (!manifest.audioPath || !existsSync(manifest.audioPath)) {
    manifest = extractAudio(captureDir);
  }
  if (!manifest.audioPath || !existsSync(manifest.audioPath)) {
    throw new Error("No extracted audio exists. Make sure microphone audio was enabled in the native macOS recording UI.");
  }

  const venvPython = join(atscHome, ".venv", "bin", "python");
  if (!existsSync(venvPython)) {
    throw new Error("Transcriber virtualenv is missing. Run: atsc setup-transcriber");
  }

  const transcriptPath = join(captureDir, "transcript.txt");
  const result = run(venvPython, [join(scriptsRoot, "transcribe.py"), manifest.audioPath, transcriptPath, "--model", model]);
  if (result.status !== 0) {
    const message = trimToolError(result.stderr || result.stdout);
    if (message.includes("faster_whisper")) {
      throw new Error(`faster-whisper is not installed. Run: atsc setup-transcriber\n${message}`);
    }
    throw new Error(`Transcription failed: ${message}`);
  }
  const transcript = existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : result.stdout;
  manifest = updateManifest(captureDir, { transcriptPath });
  return { manifest, transcript };
}

export function setupTranscriber(): void {
  if (!commandExists("python3")) throw new Error("python3 is required to create the transcriber virtualenv.");
  mkdirSync(atscHome, { recursive: true });
  const venvDir = join(atscHome, ".venv");
  if (!existsSync(venvDir)) {
    const created = run("python3", ["-m", "venv", venvDir]);
    if (created.status !== 0) throw new Error(`Failed to create .venv: ${trimToolError(created.stderr)}`);
  }
  const python = join(venvDir, "bin", "python");
  const pip = [python, "-m", "pip"];
  const upgraded = run(pip[0], [...pip.slice(1), "install", "--upgrade", "pip"]);
  if (upgraded.status !== 0) throw new Error(`Failed to upgrade pip: ${trimToolError(upgraded.stderr)}`);
  const installed = run(pip[0], [...pip.slice(1), "install", "faster-whisper"]);
  if (installed.status !== 0) throw new Error(`Failed to install faster-whisper: ${trimToolError(installed.stderr)}`);
}

export function prepareCapture(input?: string): {
  manifest: Manifest;
  transcriptText: string;
  recordingPath: string;
} {
  const captureDir = input ? resolveCaptureDir(input) : getLatestCaptureDir();
  const manifest = readManifest(captureDir);
  const transcriptText = manifest.transcriptPath && existsSync(manifest.transcriptPath)
    ? readFileSync(manifest.transcriptPath, "utf8")
    : "";
  return {
    manifest,
    transcriptText,
    recordingPath: manifest.recordingPath
  };
}

export function listCaptures(): Manifest[] {
  if (!existsSync(capturesRoot)) return [];
  return readdirSync(capturesRoot)
    .map(name => join(capturesRoot, name))
    .filter(path => statSync(path).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .map(path => readManifest(path));
}

export function getLatestCaptureDir(): string {
  if (existsSync(latestPath)) return readLatest().captureDir;
  const captures = listCaptures();
  if (captures.length === 0) throw new Error("No captures found.");
  return dirname(captures[0].recordingPath);
}

export type DoctorReport = {
  atscHome: string;
  capturesRoot: string;
  latestPath: string;
  screenshot: {
    saveLocation?: string;
    target?: string;
    ok: boolean;
  };
  tools: Record<string, boolean>;
  transcriber: {
    venvPath: string;
    installed: boolean;
  };
  latestCapture?: LatestCapture;
  errors: string[];
};

export function doctor(): DoctorReport {
  const errors: string[] = [];
  mkdirSync(atscHome, { recursive: true });
  mkdirSync(capturesRoot, { recursive: true });

  const saveLocationResult = run("defaults", ["read", "com.apple.screencapture", "location"]);
  const targetResult = run("defaults", ["read", "com.apple.screencapture", "target"]);
  const saveLocation = saveLocationResult.status === 0 && saveLocationResult.stdout.trim()
    ? resolveHome(saveLocationResult.stdout.trim())
    : undefined;
  const target = targetResult.status === 0 && targetResult.stdout.trim()
    ? targetResult.stdout.trim()
    : undefined;

  if (!saveLocation) errors.push("Screenshot save location is not configured; set Screenshot Options to a folder.");
  else if (!existsSync(saveLocation)) errors.push(`Screenshot save location does not exist: ${saveLocation}`);
  if (target && target !== "file") errors.push(`Screenshot target is "${target}", not "file"; set Screenshot Options to save to a folder.`);

  const transcriberInstalled = existsSync(join(atscHome, ".venv", "bin", "python"));
  if (!transcriberInstalled) errors.push("Transcriber virtualenv is missing; run: atsc setup-transcriber");

  let latestCapture: LatestCapture | undefined;
  if (existsSync(latestPath)) {
    try {
      latestCapture = readLatest();
    } catch (error) {
      errors.push(`Could not read latest pointer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    atscHome,
    capturesRoot,
    latestPath,
    screenshot: {
      saveLocation,
      target,
      ok: Boolean(saveLocation && existsSync(saveLocation) && (!target || target === "file"))
    },
    tools: {
      open: commandExists("open"),
      afconvert: commandExists("afconvert"),
      ffmpeg: commandExists("ffmpeg"),
      ffprobe: commandExists("ffprobe"),
      mdls: commandExists("mdls"),
      python3: commandExists("python3")
    },
    transcriber: {
      venvPath: join(atscHome, ".venv"),
      installed: transcriberInstalled
    },
    latestCapture,
    errors
  };
}

export function getMediaInfo(recordingPath: string): { durationSeconds?: number; errors: string[]; fallbacks: string[] } {
  const errors: string[] = [];
  const fallbacks: string[] = [];
  if (commandExists("ffprobe")) {
    const result = run("ffprobe", ["-v", "error", "-show_format", "-of", "json", recordingPath]);
    if (result.status === 0) {
      const json = JSON.parse(result.stdout) as { format?: { duration?: string } };
      const durationSeconds = json.format?.duration ? Number(json.format.duration) : undefined;
      return { durationSeconds, errors, fallbacks };
    }
    errors.push(`ffprobe failed: ${trimToolError(result.stderr)}`);
  }

  fallbacks.push("ffprobe not installed or failed; used macOS mdls media info");
  const result = run("mdls", ["-raw", "-name", "kMDItemDurationSeconds", recordingPath]);
  if (result.status !== 0) {
    errors.push(`mdls media info failed: ${trimToolError(result.stderr || result.stdout)}`);
    return { errors, fallbacks };
  }
  const durationSeconds = Number(result.stdout.trim());
  if (!Number.isFinite(durationSeconds)) {
    return { errors, fallbacks };
  }
  return { durationSeconds, errors, fallbacks };
}

function getScreenshotSaveDir(): string {
  const configured = run("defaults", ["read", "com.apple.screencapture", "location"]);
  if (configured.status === 0 && configured.stdout.trim()) {
    const saveDir = resolveHome(configured.stdout.trim());
    if (existsSync(saveDir)) return saveDir;
    throw new Error(`Configured Screenshot save location does not exist: ${saveDir}`);
  }
  const desktop = join(homedir(), "Desktop");
  if (existsSync(desktop)) return desktop;
  throw new Error("Could not determine Screenshot save location from com.apple.screencapture location.");
}

function snapshotMovFiles(dir: string): Map<string, number> {
  const files = new Map<string, number>();
  for (const file of listMovFiles(dir)) {
    files.set(file, statSync(file).mtimeMs);
  }
  return files;
}

async function waitForNewStableMov(dir: string, before: Map<string, number>, startedAt: number): Promise<string> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const candidates = listMovFiles(dir)
      .filter(file => {
        const stats = statSync(file);
        return stats.mtimeMs >= startedAt - 1000 && (!before.has(file) || before.get(file) !== stats.mtimeMs);
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    for (const candidate of candidates) {
      if (await isStableFile(candidate)) return candidate;
    }
    await sleep(1000);
  }
  throw new Error(
    `Timed out waiting for a new .mov from Screenshot.app in ${dir}. ` +
    "Make sure Screenshot Options is set to this folder before launching atsc, not Clipboard."
  );
}

function listMovFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith(".mov"))
      .map(file => join(dir, file));
  } catch {
    return [];
  }
}

async function isStableFile(path: string): Promise<boolean> {
  const first = statSync(path).size;
  await sleep(1200);
  return existsSync(path) && statSync(path).size === first && first > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function resolveHome(path: string): string {
  return resolve(path.replace(/^~($|\/)/, `${homedir()}$1`));
}

export function resolveCaptureDir(input: string): string {
  const candidate = resolveHome(input);
  if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  const byId = join(capturesRoot, input);
  if (existsSync(byId) && statSync(byId).isDirectory()) return byId;
  return candidate;
}

function resolveCaptureDirOrPath(input: string): string {
  const candidate = resolveHome(input);
  if (existsSync(candidate)) return candidate;
  const byId = join(capturesRoot, input);
  if (existsSync(byId)) return byId;
  const byIdRecording = join(capturesRoot, input, "recording.mov");
  if (existsSync(byIdRecording)) return byIdRecording;
  return candidate;
}

function trimToolError(value: string): string {
  return value.trim().split("\n").slice(-8).join("\n");
}

export function displayPath(path: string): string {
  return isAbsolute(path) ? path : resolve(path);
}
