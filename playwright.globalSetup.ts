import net from 'node:net';
import { spawnSync } from 'node:child_process';

const EXAMPLE_SERVER_URL = 'http://localhost:3333';
const BUILD_NODE_OPTIONS = '--max_old_space_size=32896';

function shouldReuseExistingServer() {
  return process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true'
    ? true
    : process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'false'
      ? false
      : !process.env.CI;
}

function canConnect(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function isExampleServerRunning() {
  const url = new URL(EXAMPLE_SERVER_URL);
  const port = Number(url.port);

  return (await canConnect(port, '127.0.0.1')) || (await canConnect(port, '::1'));
}

function runBuildAllExamples() {
  const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
  const result = spawnSync(yarnCommand, ['run', 'build-all-examples'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || BUILD_NODE_OPTIONS,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `build-all-examples failed with exit code ${result.status ?? 'unknown'}`
    );
  }
}

export default async function globalSetup() {
  if (shouldReuseExistingServer() && (await isExampleServerRunning())) {
    return;
  }

  runBuildAllExamples();
}
