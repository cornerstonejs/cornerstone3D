import { utilities } from '@cornerstonejs/core';
import getOrtWasmPaths from './getOrtWasmPaths';

/**
 * How a base is resolved is `resolveApplicationUrl`/`resolveWasmBasePath` in
 * `@cornerstonejs/core`, covered by `packages/core/test/wasmBasePath.jest.js`.
 * What is left here is what this module decides: the standard directory, and
 * which of the two resolvers a given call goes through.
 */
describe('getOrtWasmPaths', () => {
  const publicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    delete (globalThis as { PUBLIC_URL?: string }).PUBLIC_URL;
    delete process.env.PUBLIC_URL;
    utilities.setWasmBasePath(undefined);
    window.history.replaceState(null, '', '/');
  });

  afterAll(() => {
    if (publicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = publicUrl;
    }
  });

  it('looks in ort/ under the application base', () => {
    process.env.PUBLIC_URL = '/pacs/';
    // The bug this guards: `'ort/'` used to resolve against the route, so a
    // viewer on /pacs/viewer/dicomweb fetched /pacs/viewer/ort/ and got
    // index.html back.
    window.history.replaceState(null, '', '/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('loads from the configured wasm directory, the way the codecs do', () => {
    utilities.setWasmBasePath('/assets/cs-wasm/');

    expect(getOrtWasmPaths()).toBe('http://localhost/assets/cs-wasm/');
  });

  it('lets a caller-named directory outrank the configured one', () => {
    utilities.setWasmBasePath('/assets/cs-wasm/');

    expect(getOrtWasmPaths('https://cdn.example.com/onnx/1.17/')).toBe(
      'https://cdn.example.com/onnx/1.17/'
    );
    expect(getOrtWasmPaths('ort-1.17.1/')).toBe('http://localhost/ort-1.17.1/');
  });
});
