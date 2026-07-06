import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "dist", "cli.js");

function testEnv() {
  return { ...process.env, ATSC_HOME: mkdtempSync(join(tmpdir(), "atsc-test-")) };
}

test("CLI help launches", () => {
  const result = spawnSync("node", [cli, "--help"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /atsc - narrated screen capture for coding agents/);
  assert.doesNotMatch(result.stdout, /mcp/i);
});

test("capture dry-run creates a capture manifest without launching recorder UI", () => {
  const env = { ...testEnv(), ATSC_DRY_RUN: "1" };
  const result = spawnSync("node", [cli, "capture"], {
    cwd: root,
    encoding: "utf8",
    env
  });
  assert.equal(result.status, 0, result.stderr);
  const commandLine = result.stdout.split("\n").find(line => line.startsWith("command: "));
  assert.equal(commandLine, "command: open -a Screenshot");
  assert.doesNotMatch(commandLine, /screencapture/);
  assert.doesNotMatch(commandLine, /-U/);
  assert.doesNotMatch(commandLine, /-J video/);
  assert.doesNotMatch(commandLine, /-g/);
  assert.doesNotMatch(commandLine, / -i /);
  const dirLine = result.stdout.split("\n").find(line => line.startsWith("dir: "));
  assert.ok(dirLine);
  const captureDir = dirLine.replace("dir: ", "").trim();
  assert.ok(existsSync(join(captureDir, "manifest.json")));
  assert.ok(existsSync(join(env.ATSC_HOME, "latest.json")));
  rmSync(captureDir, { recursive: true, force: true });
});

test("capture rejects extra capture flags", () => {
  const result = spawnSync("node", [cli, "capture", "--duration", "1"], { cwd: root, encoding: "utf8", env: testEnv() });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only capture flag is --no-transcript/);
});

test("prepare fails clearly for a missing capture", () => {
  const result = spawnSync("node", [cli, "prepare", "captures/definitely-missing-smoke-capture"], { cwd: root, encoding: "utf8", env: testEnv() });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT|no such file/i);
});
