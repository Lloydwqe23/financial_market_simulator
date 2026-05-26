import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const processes = [];
const scriptDir = dirname(fileURLToPath(import.meta.url));
const viteBin = resolve(scriptDir, '../node_modules/vite/bin/vite.js');
const apiServer = resolve(scriptDir, '../server/api-server.mjs');

function start(command, args, label, env = process.env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      process.exitCode = code;
      shutdown();
    }
  });

  processes.push(child);
}

function shutdown() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function canListen(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function isOurApiRunning(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && data.ok === true && data.service === 'market-simulator-api');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function findFreePort(host, startPort) {
  for (let port = startPort; port < startPort + 50; port++) {
    if (await canListen(host, port)) return port;
  }
  throw new Error(`No free port found near ${startPort}`);
}

async function main() {
  const host = process.env.API_HOST || '127.0.0.1';
  const requestedPort = Number(process.env.API_PORT) || 8787;
  let apiPort = requestedPort;
  let shouldStartApi = true;

  if (!(await canListen(host, apiPort))) {
    if (await isOurApiRunning(host, apiPort)) {
      console.log(`API already running on http://${host}:${apiPort} (reusing).`);
      shouldStartApi = false;
    } else {
      apiPort = await findFreePort(host, requestedPort + 1);
      console.warn(`Port ${requestedPort} is busy; starting API on http://${host}:${apiPort} instead.`);
    }
  }

  const childEnv = { ...process.env, API_HOST: host, API_PORT: String(apiPort) };
  if (shouldStartApi) start(process.execPath, [apiServer], 'API server', childEnv);
  start(process.execPath, [viteBin], 'Vite dev server', childEnv);
}

main().catch((err) => {
  console.error('Failed to start dev processes:', err);
  process.exitCode = 1;
  shutdown();
});