import { utilities } from '@cornerstonejs/core';
import getOrtWasmPaths from './getOrtWasmPaths';

/**
 * How a base is resolved is `resolveWasmBasePath` in `@cornerstonejs/core`,
 * covered by `packages/core/test/wasmBasePath.jest.js`. What is left here is the
 * one thing this module decides - the standard directory - and that the two ways
 * an application declares a location both reach the ONNX Runtime.
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

  it('serves the binaries from a CDN the configured directory names', () => {
    utilities.setWasmBasePath('https://cdn.example.com/wasm/');

    expect(getOrtWasmPaths()).toBe('https://cdn.example.com/wasm/');
  });
});
