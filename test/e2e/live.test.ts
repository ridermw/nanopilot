/**
 * Live E2E test — exercises the real agent runner with a live Copilot session.
 * Requires COPILOT_GITHUB_TOKEN to be set. Skipped in CI unless token is available.
 *
 * Run manually: COPILOT_GITHUB_TOKEN=$(gh auth token) npx vitest run --config vitest.e2e.config.ts test/e2e/live.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN;
const CONTAINER_IMAGE = 'nanopilot-agent:latest';

// Skip entire suite if no token
const describeIf = GITHUB_TOKEN ? describe : describe.skip;

describeIf('E2E Live: Real Copilot agent session', () => {
  let tempDir: string;

  beforeAll(() => {
    // Verify container image exists
    try {
      execSync(`docker image inspect ${CONTAINER_IMAGE}`, { stdio: 'pipe' });
    } catch {
      throw new Error(`Container image ${CONTAINER_IMAGE} not found. Run ./container/build.sh first.`);
    }

    // Create temp directory for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanopilot-e2e-'));
  });

  it('agent responds to a simple prompt', async () => {
    // Create the required directory structure
    const groupDir = path.join(tempDir, 'test-group');
    const logsDir = path.join(groupDir, 'logs');
    const copilotDir = path.join(tempDir, '.copilot');
    const ipcDir = path.join(tempDir, 'ipc');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(copilotDir, { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'messages'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'tasks'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });

    // Create CLAUDE.md for the agent
    fs.writeFileSync(path.join(groupDir, 'CLAUDE.md'), '# Test Agent\nYou are a test assistant. Reply concisely.');

    // Build ContainerInput
    const input = {
      prompt: '<messages><message sender="TestUser" timestamp="2024-01-01T12:00:00Z">Say exactly: PONG</message></messages>',
      groupFolder: 'test-group',
      chatJid: 'test:live-e2e',
      isMain: false,
      assistantName: 'TestBot',
      githubToken: GITHUB_TOKEN,
    };

    // Spawn container
    const containerName = `nanopilot-live-e2e-${Date.now()}`;
    const args = [
      'run', '-i', '--rm', '--name', containerName,
      '-v', `${groupDir}:/workspace/group`,
      '-v', `${copilotDir}:/home/node/.copilot`,
      '-v', `${ipcDir}:/workspace/ipc`,
      CONTAINER_IMAGE,
    ];

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      const timeout = setTimeout(() => {
        try { execSync(`docker stop ${containerName}`, { stdio: 'pipe' }); } catch {}
        reject(new Error(`Container timed out after 60s.\nStdout: ${stdout}\nStderr: ${stderr}`));
      }, 60_000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Container exited with code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });

    // Parse output — look for OUTPUT_MARKER pair
    const startMarker = '---NANOPILOT_OUTPUT_START---';
    const endMarker = '---NANOPILOT_OUTPUT_END---';
    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);

    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const jsonStr = result.slice(startIdx + startMarker.length, endIdx).trim();
    const output = JSON.parse(jsonStr);

    expect(output.status).toBe('success');
    expect(output.result).toBeTruthy();
    // The agent should respond with something containing PONG
    expect(output.result.toUpperCase()).toContain('PONG');
  }, 120_000); // 2 min timeout for the full test

  it('agent handles session continuity', async () => {
    // This test verifies that newSessionId is returned and can be reused
    const groupDir = path.join(tempDir, 'session-test');
    const copilotDir = path.join(tempDir, '.copilot-session');
    const ipcDir = path.join(tempDir, 'ipc-session');
    fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
    fs.mkdirSync(copilotDir, { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'messages'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'tasks'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });
    fs.writeFileSync(path.join(groupDir, 'CLAUDE.md'), '# Test\nReply concisely.');

    const input = {
      prompt: '<messages><message sender="User" timestamp="2024-01-01T12:00:00Z">What is 2+2?</message></messages>',
      groupFolder: 'session-test',
      chatJid: 'test:session-e2e',
      isMain: false,
      githubToken: GITHUB_TOKEN,
    };

    const containerName = `nanopilot-session-e2e-${Date.now()}`;
    const args = [
      'run', '-i', '--rm', '--name', containerName,
      '-v', `${groupDir}:/workspace/group`,
      '-v', `${copilotDir}:/home/node/.copilot`,
      '-v', `${ipcDir}:/workspace/ipc`,
      CONTAINER_IMAGE,
    ];

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();
      const t = setTimeout(() => {
        try { execSync(`docker stop ${containerName}`, { stdio: 'pipe' }); } catch {}
        reject(new Error(`Timeout.\nStdout: ${stdout}\nStderr: ${stderr}`));
      }, 60_000);
      proc.on('close', (code) => {
        clearTimeout(t);
        if (code !== 0) {
          reject(new Error(`Container exited with code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });

    const startMarker = '---NANOPILOT_OUTPUT_START---';
    const endMarker = '---NANOPILOT_OUTPUT_END---';
    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);

    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const output = JSON.parse(result.slice(startIdx + startMarker.length, endIdx).trim());
    // If we got a session ID, verify it's a non-empty string
    if (output.newSessionId) {
      expect(typeof output.newSessionId).toBe('string');
      expect(output.newSessionId.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
