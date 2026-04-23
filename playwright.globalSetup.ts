import { spawnSync } from 'node:child_process';

const BUILD_NODE_OPTIONS = '--max_old_space_size=32896';
const DEFAULT_REBUILD_PACKAGES = 'core,tools,dicomImageLoader';

function runBuildExamples() {
  const packages =
    process.env.PLAYWRIGHT_REBUILD_PACKAGES || DEFAULT_REBUILD_PACKAGES;

  const result = spawnSync(
    process.execPath,
    [
      './utils/ExampleRunner/build-all-examples-cli.js',
      '--build',
      '--fromRoot',
      '--packages',
      packages,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS || BUILD_NODE_OPTIONS,
      },
    }
  );

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
  runBuildExamples();
}
