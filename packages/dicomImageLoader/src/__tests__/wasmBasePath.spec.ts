/**
 * Unit tests for the codec WASM base path resolution.
 *
 * The decoders normally locate their binaries with a bare
 * `@cornerstonejs/codec-...` specifier inside `new URL(..., import.meta.url)`,
 * which bundlers do not rewrite. `wasmBasePath` lets an application point all
 * of the codecs at one directory it serves itself. These tests pin down the
 * joining rules (trailing slash, absolute/relative/full-URL roots) and the
 * fallback to the decoder's built-in location when no base path is set.
 */

import {
  getWasmBasePath,
  resolveWasmUrl,
  setWasmBasePath,
  setWasmBasePathFromConfig,
} from '../shared/wasmBasePath';

const DEFAULT_URL = 'http://localhost/node_modules/codec/decodewasm';
const FILE = 'charlswasm_decode.wasm';

describe('wasmBasePath', () => {
  afterEach(() => {
    setWasmBasePath(undefined);
  });

  it('falls back to the decoder default when unset', () => {
    expect(getWasmBasePath()).toBeUndefined();
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(DEFAULT_URL);
  });

  it('accepts a URL object as the default', () => {
    const url = new URL(DEFAULT_URL);
    expect(resolveWasmUrl(FILE, url)).toBe(url.toString());
  });

  it('appends the file name to an absolute base path', () => {
    setWasmBasePath('/assets/cs-wasm/');
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(
      `http://localhost/assets/cs-wasm/${FILE}`
    );
  });

  it('adds a missing trailing slash', () => {
    setWasmBasePath('/assets/cs-wasm');
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(
      `http://localhost/assets/cs-wasm/${FILE}`
    );
  });

  it('supports a full URL base path', () => {
    setWasmBasePath('https://cdn.example.com/cs-wasm/');
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(
      `https://cdn.example.com/cs-wasm/${FILE}`
    );
  });

  it('resolves a relative base path against the current location', () => {
    setWasmBasePath('cs-wasm/');
    // jsdom serves the test at http://localhost/, so a relative root lands
    // next to it. In the worker this is the worker script's directory, which
    // is what the default import.meta.url resolution uses too.
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(
      `http://localhost/cs-wasm/${FILE}`
    );
  });

  it('uses one root for every codec', () => {
    setWasmBasePath('/assets/cs-wasm/');
    const files = [
      'charlswasm_decode.wasm',
      'libjpegturbowasm_decode.wasm',
      'openjpegwasm_decode.wasm',
      'openjphjs.wasm',
    ];

    expect(files.map((f) => resolveWasmUrl(f, DEFAULT_URL))).toEqual(
      files.map((f) => `http://localhost/assets/cs-wasm/${f}`)
    );
  });

  it('treats an empty base path as unset', () => {
    setWasmBasePath('/assets/cs-wasm/');
    setWasmBasePath('');
    expect(getWasmBasePath()).toBeUndefined();
    expect(resolveWasmUrl(FILE, DEFAULT_URL)).toBe(DEFAULT_URL);
  });

  describe('setWasmBasePathFromConfig', () => {
    it('takes the path from a decode config', () => {
      setWasmBasePathFromConfig({ wasmBasePath: '/assets/cs-wasm/' });
      expect(getWasmBasePath()).toBe('/assets/cs-wasm/');
    });

    it('leaves the current path alone for a config without one', () => {
      setWasmBasePath('/assets/cs-wasm/');
      setWasmBasePathFromConfig({});
      setWasmBasePathFromConfig(undefined);
      expect(getWasmBasePath()).toBe('/assets/cs-wasm/');
    });
  });
});
