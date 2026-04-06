/**
 * Live E2E test — exercises the real agent runner with a live Copilot session.
 * Requires COPILOT_GITHUB_TOKEN to be set. Skipped in CI unless token is available.
 *
 * Run manually: COPILOT_GITHUB_TOKEN=$(gh auth token) npx vitest run --config vitest.e2e.config.ts test/e2e/live.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN;
const CONTAINER_IMAGE = 'nanopilot-agent:latest';

// Skip entire suite if no token
const describeIf = GITHUB_TOKEN ? describe : describe.skip;

/** Reusable container run result */
interface ContainerResult {
  stdout: string;
  stderr: string;
  output: { status: string; result: string | null; newSessionId?: string; error?: string };
}

/** Shared setup: temp dirs mimicking the container mount structure */
function createTestDirs(baseTempDir: string, name: string, claudeMd?: string) {
  const groupDir = path.join(baseTempDir, name);
  const copilotDir = path.join(baseTempDir, `.copilot-${name}`);
  const ipcDir = path.join(baseTempDir, `ipc-${name}`);
  const globalDir = path.join(baseTempDir, `global-${name}`);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
  fs.mkdirSync(copilotDir, { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(
    path.join(groupDir, 'CLAUDE.md'),
    claudeMd ?? '# Test Agent\nYou are a test assistant. Reply concisely.',
  );

  // Mount the real global CLAUDE.md if it exists (tests shipped guidance)
  const repoGlobalClaudeMd = path.resolve(__dirname, '../../groups/global/CLAUDE.md');
  if (fs.existsSync(repoGlobalClaudeMd)) {
    fs.copyFileSync(repoGlobalClaudeMd, path.join(globalDir, 'CLAUDE.md'));
  }

  return { groupDir, copilotDir, ipcDir, globalDir };
}

/** Spawn a container, pass input via stdin, return parsed output + stderr */
async function runContainer(
  input: Record<string, unknown>,
  mounts: { groupDir: string; copilotDir: string; ipcDir: string; globalDir: string },
  timeoutMs = 60_000,
): Promise<ContainerResult> {
  const containerName = `nanopilot-live-e2e-${Date.now()}`;
  const args = [
    'run', '-i', '--rm', '--name', containerName,
    '-v', `${mounts.groupDir}:/workspace/group`,
    '-v', `${mounts.copilotDir}:/home/node/.copilot`,
    '-v', `${mounts.ipcDir}:/workspace/ipc`,
    '-v', `${mounts.globalDir}:/workspace/global`,
    CONTAINER_IMAGE,
  ];

  return new Promise<ContainerResult>((resolve, reject) => {
    const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();

    const timeout = setTimeout(() => {
      try { execSync(`docker stop ${containerName}`, { stdio: 'pipe' }); } catch (_e) { /* stop may fail if container already exited */ }
      reject(new Error(`Container timed out after ${timeoutMs}ms.\nStdout: ${stdout}\nStderr: ${stderr}`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Container exited with code ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
        return;
      }

      // Parse output markers
      const startMarker = '---NANOPILOT_OUTPUT_START---';
      const endMarker = '---NANOPILOT_OUTPUT_END---';
      const startIdx = stdout.indexOf(startMarker);
      const endIdx = stdout.indexOf(endMarker);

      if (startIdx === -1 || endIdx <= startIdx) {
        reject(new Error(`Missing output markers.\nStdout: ${stdout}\nStderr: ${stderr}`));
        return;
      }

      const jsonStr = stdout.slice(startIdx + startMarker.length, endIdx).trim();
      const output = JSON.parse(jsonStr);
      resolve({ stdout, stderr, output });
    });
  });
}

describeIf('E2E Live: Real Copilot agent session', () => {
  let tempDir: string;

  beforeAll(() => {
    // Verify container image exists
    try {
      execSync(`docker image inspect ${CONTAINER_IMAGE}`, { stdio: 'pipe' });
    } catch (inspectErr) {
      throw new Error(`Container image ${CONTAINER_IMAGE} not found. Run ./container/build.sh first.`, { cause: inspectErr });
    }

    // Create temp directory for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanopilot-e2e-'));
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('agent responds to a simple prompt', async () => {
    const dirs = createTestDirs(tempDir, 'simple');

    const input = {
      prompt: '<messages><message sender="TestUser" timestamp="2024-01-01T12:00:00Z">Say exactly: PONG</message></messages>',
      groupFolder: 'simple',
      chatJid: 'test:live-e2e',
      isMain: false,
      assistantName: 'TestBot',
      githubToken: GITHUB_TOKEN,
    };

    const { output } = await runContainer(input, dirs);

    expect(output.status).toBe('success');
    expect(output.result).toBeTruthy();
    expect(output.result!.toUpperCase()).toContain('PONG');
  }, 120_000);

  it('agent handles session continuity', async () => {
    const dirs = createTestDirs(tempDir, 'session');

    const input = {
      prompt: '<messages><message sender="User" timestamp="2024-01-01T12:00:00Z">What is 2+2?</message></messages>',
      groupFolder: 'session',
      chatJid: 'test:session-e2e',
      isMain: false,
      githubToken: GITHUB_TOKEN,
    };

    const { output } = await runContainer(input, dirs);

    if (output.newSessionId) {
      expect(typeof output.newSessionId).toBe('string');
      expect(output.newSessionId.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('agent uses web_search/web_fetch for web research (not agent-browser)', async () => {
    const dirs = createTestDirs(tempDir, 'websearch');

    const input = {
      prompt: '<messages><message sender="TestUser" timestamp="2024-01-01T12:00:00Z">Search the web for "NanoClaw GitHub AI assistant" and tell me what you found. Use web_search, not agent-browser.</message></messages>',
      groupFolder: 'websearch',
      chatJid: 'test:websearch-e2e',
      isMain: false,
      assistantName: 'TestBot',
      githubToken: GITHUB_TOKEN,
    };

    const { output, stderr } = await runContainer(input, dirs, 90_000);

    expect(output.status).toBe('success');
    expect(output.result).toBeTruthy();
    // Result should contain meaningful content, not an error or empty search
    expect(output.result!.length).toBeGreaterThan(20);

    // Tool usage assertions: stderr contains "Tool: <name>" lines from agent-runner
    const toolLines = stderr.split('\n').filter((l) => l.includes('Tool: '));
    const toolNames = toolLines.map((l) => l.match(/Tool: (.+)/)?.[1]?.trim()).filter(Boolean);

    // Should have used web_search or web_fetch (built-in Copilot tools)
    const usedWebTool = toolNames.some(
      (t) => t === 'web_search' || t === 'web_fetch' || t === 'fetch_webpage',
    );
    expect(usedWebTool, `Expected web_search/web_fetch in tools used: [${toolNames.join(', ')}]`).toBe(true);

    // Should NOT have launched agent-browser for a simple search
    const usedBrowser = toolNames.some(
      (t) => t?.includes('agent-browser') || t?.includes('Bash(agent-browser'),
    );
    expect(usedBrowser, `agent-browser should not be used for web search: [${toolNames.join(', ')}]`).toBe(false);
  }, 180_000);
});
