import { spawn } from 'node:child_process';

const proc = spawn('memex-mcp', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let done = false;

const finish = (ok, msg) => {
  if (done) return;
  done = true;
  process.stdout.write(`STDOUT:\n${stdout}\n`);
  process.stderr.write(`STDERR:\n${stderr}\n`);
  if (!ok) process.stderr.write(`FAIL: ${msg}\n`);
  proc.kill();
  process.exit(ok ? 0 : 1);
};

proc.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  if (stdout.includes('"serverInfo"')) finish(true);
});
proc.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});
proc.on('exit', (code) => finish(false, `memex-mcp exited early with code ${code}`));
proc.on('error', (err) => finish(false, `spawn error: ${err.message}`));

setTimeout(() => finish(false, 'timed out waiting for initialize response'), 8000);

const initRequest = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'ci-smoke', version: '0.0.0' },
  },
}) + '\n';

proc.stdin.write(initRequest);
