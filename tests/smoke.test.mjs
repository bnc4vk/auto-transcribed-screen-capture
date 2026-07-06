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
  assert.match(result.stdout, /open -a Screenshot/);
  assert.doesNotMatch(result.stdout, /screencapture/);
  assert.doesNotMatch(result.stdout, /-U/);
  assert.doesNotMatch(result.stdout, /-J video/);
  assert.doesNotMatch(result.stdout, /-g/);
  assert.doesNotMatch(result.stdout, / -i /);
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
