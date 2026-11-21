import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const PACKAGES = path.resolve(__dirname, '..', '..');

/** The source files of a package, without its tests. */
function sourceFiles(folder) {
  if (!fs.existsSync(folder)) {
    return [];
  }

  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(file);
    }

    return /\.(ts|tsx|js)$/.test(entry.name) &&
      !/\.(test|spec|jest)\./.test(entry.name)
      ? [file]
      : [];
  });
}

/**
 * The `??` expressions of a file that wait inside one of their operands:
 * `a ?? (await b)`, `a ??= await b` and `(await a) ?? b`.
 */
function awaitsInNullishCoalescing(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(
      ({ line }) =>
        /\?\?=?\s*\(?\s*await\b/.test(line) ||
        /\(\s*await\b[^)]*\)\s*\?\?/.test(line)
    )
    .map(({ number }) => `${path.relative(PACKAGES, file)}:${number}`);
}

describe('The published source and the regenerator of babel', () => {
  it('has no await inside a ?? expression, which the regenerator plugin of babel cannot transform', () => {
    const sites = fs
      .readdirSync(PACKAGES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => sourceFiles(path.join(PACKAGES, entry.name, 'src')))
      .flatMap(awaitsInNullishCoalescing);

    expect(sites).toEqual([]);
  });
});
