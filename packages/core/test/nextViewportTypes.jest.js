import { describe, it, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import path from 'path';

const typesFolder = path.resolve(__dirname, 'types');
const compiler = require.resolve('typescript/bin/tsc');

/**
 * Runs the TypeScript compiler on `types/nextViewportCalls.ts`, with the
 * options of the repository, and returns the errors it reports.
 */
function compileNextViewportCalls() {
  const result = spawnSync(
    process.execPath,
    [
      compiler,
      '-p',
      path.join(typesFolder, 'tsconfig.json'),
      '--pretty',
      'false',
    ],
    { cwd: typesFolder, encoding: 'utf8' }
  );
  const errors = `${result.stdout}${result.stderr}`
    .split('\n')
    .filter((line) => line.includes('error TS'));

  return { status: result.status, errors };
}

describe('The types of a next viewport', () => {
  it('accept the calls of the migration guide without a cast', () => {
    const { status, errors } = compileNextViewportCalls();

    expect(errors).toEqual([]);
    expect(status).toBe(0);
  }, 300000);
});
