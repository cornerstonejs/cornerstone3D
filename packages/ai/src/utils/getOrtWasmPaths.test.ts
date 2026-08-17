import { utilities } from '@cornerstonejs/core';
import getOrtWasmPaths from './getOrtWasmPaths';

type PublicUrlGlobal = typeof globalThis & {
  PUBLIC_URL?: string;
  config?: { path?: string };
};

const publicUrlGlobal = globalThis as PublicUrlGlobal;

/** Puts the document on `route` the way a client-side router would. */
function navigateTo(route: string) {
  window.history.replaceState(null, '', route);
}

describe('getOrtWasmPaths', () => {
  const publicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    delete publicUrlGlobal.PUBLIC_URL;
    delete publicUrlGlobal.config;
    delete process.env.PUBLIC_URL;
    utilities.setWasmBasePath(undefined);
    navigateTo('/');
  });

  afterAll(() => {
    if (publicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = publicUrl;
    }
  });

  it('resolves against the server root when nothing declares a base', () => {
    expect(getOrtWasmPaths()).toBe('http://localhost/ort/');
  });

  it('resolves against the application root from a deep route', () => {
    // The bug this guards: `'ort/'` used to resolve against the route, so a
    // viewer on /viewer/dicomweb fetched /viewer/ort/ and got index.html back.
    navigateTo('/viewer/dicomweb/studies/1.2.3');

    expect(getOrtWasmPaths()).toBe('http://localhost/ort/');
  });

  it('keeps the same relative location for a sub-path build', () => {
    process.env.PUBLIC_URL = '/pacs/';
    navigateTo('/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('accepts a runtime PUBLIC_URL on the global', () => {
    publicUrlGlobal.PUBLIC_URL = '/pacs/';
    navigateTo('/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('accepts the base from a viewer configuration object', () => {
    publicUrlGlobal.config = { path: '/pacs/' };

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('prefers a runtime PUBLIC_URL over the build-time one', () => {
    publicUrlGlobal.PUBLIC_URL = '/runtime/';
    process.env.PUBLIC_URL = '/build/';

    expect(getOrtWasmPaths()).toBe('http://localhost/runtime/ort/');
  });

  it('tolerates a PUBLIC_URL without its trailing slash', () => {
    process.env.PUBLIC_URL = '/pacs';
    navigateTo('/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('uses a full URL PUBLIC_URL as given', () => {
    publicUrlGlobal.PUBLIC_URL = 'http://cdn.example.com/app/';

    expect(getOrtWasmPaths()).toBe('http://cdn.example.com/app/ort/');
  });

  describe('with the system-level wasm directory set', () => {
    it('loads the binaries from it, the way the codecs do', () => {
      utilities.setWasmBasePath('/assets/cs-wasm/');
      navigateTo('/viewer/dicomweb');

      expect(getOrtWasmPaths()).toBe('http://localhost/assets/cs-wasm/');
    });

    it('takes it in preference to PUBLIC_URL', () => {
      utilities.setWasmBasePath('https://cdn.example.com/wasm/');
      process.env.PUBLIC_URL = '/pacs/';

      expect(getOrtWasmPaths()).toBe('https://cdn.example.com/wasm/');
    });

    it('adds the trailing slash it may be missing', () => {
      utilities.setWasmBasePath('/assets/cs-wasm');

      expect(getOrtWasmPaths()).toBe('http://localhost/assets/cs-wasm/');
    });

    it('resolves a relative one against the application base', () => {
      utilities.setWasmBasePath('cs-wasm/');
      process.env.PUBLIC_URL = '/pacs/';
      navigateTo('/pacs/viewer/dicomweb');

      expect(getOrtWasmPaths()).toBe('http://localhost/pacs/cs-wasm/');
    });

    it('is overridden by a directory the caller names', () => {
      utilities.setWasmBasePath('/assets/cs-wasm/');

      expect(getOrtWasmPaths('ort-1.17.1/')).toBe(
        'http://localhost/ort-1.17.1/'
      );
    });
  });

  it('uses an application-supplied directory as given', () => {
    navigateTo('/viewer/dicomweb');

    expect(getOrtWasmPaths('https://cdn.example.com/onnx/1.17/')).toBe(
      'https://cdn.example.com/onnx/1.17/'
    );
    expect(getOrtWasmPaths('/ort-1.17.1/')).toBe(
      'http://localhost/ort-1.17.1/'
    );
  });

  it('resolves a relative directory against the application base', () => {
    process.env.PUBLIC_URL = '/pacs/';
    navigateTo('/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths('assets/ort/')).toBe(
      'http://localhost/pacs/assets/ort/'
    );
  });
});
