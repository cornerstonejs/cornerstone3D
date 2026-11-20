import {
  getWasmBasePath,
  resolveWasmBasePath,
  setWasmBasePath,
} from '../src/utilities/wasmBasePath';
import resolveApplicationUrl, {
  getPublicUrl,
} from '../src/utilities/resolveApplicationUrl';

/** Puts the document on `route` the way a client-side router would. */
function navigateTo(route) {
  window.history.replaceState(null, '', route);
}

describe('wasm base path', () => {
  const publicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    delete globalThis.PUBLIC_URL;
    delete globalThis.config;
    delete process.env.PUBLIC_URL;
    setWasmBasePath(undefined);
    navigateTo('/');
  });

  afterAll(() => {
    if (publicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = publicUrl;
    }
  });

  describe('getPublicUrl', () => {
    it('defaults to the server root', () => {
      expect(getPublicUrl()).toBe('/');
    });

    it('reads the runtime global', () => {
      globalThis.PUBLIC_URL = '/pacs/';

      expect(getPublicUrl()).toBe('/pacs/');
    });

    it('reads a viewer configuration object', () => {
      globalThis.config = { path: '/pacs/' };

      expect(getPublicUrl()).toBe('/pacs/');
    });

    it('reads the build-time substitution', () => {
      process.env.PUBLIC_URL = '/pacs/';

      expect(getPublicUrl()).toBe('/pacs/');
    });

    it('prefers the runtime value over the build-time one', () => {
      globalThis.PUBLIC_URL = '/runtime/';
      process.env.PUBLIC_URL = '/build/';

      expect(getPublicUrl()).toBe('/runtime/');
    });
  });

  describe('resolveApplicationUrl', () => {
    it('resolves against the server root when nothing declares a base', () => {
      expect(resolveApplicationUrl('assets/x.wasm')).toBe(
        'http://localhost/assets/x.wasm'
      );
    });

    it('ignores the route', () => {
      // The bug this guards: a document-relative path resolves against the
      // route, so a viewer on /viewer/dicomweb fetched /viewer/assets/ and got
      // index.html back.
      navigateTo('/viewer/dicomweb/studies/1.2.3');

      expect(resolveApplicationUrl('assets/x.wasm')).toBe(
        'http://localhost/assets/x.wasm'
      );
    });

    it('resolves against a sub-path base', () => {
      process.env.PUBLIC_URL = '/pacs/';
      navigateTo('/pacs/viewer/dicomweb');

      expect(resolveApplicationUrl('assets/x.wasm')).toBe(
        'http://localhost/pacs/assets/x.wasm'
      );
    });

    it('tolerates a base without its trailing slash', () => {
      process.env.PUBLIC_URL = '/pacs';

      expect(resolveApplicationUrl('assets/x.wasm')).toBe(
        'http://localhost/pacs/assets/x.wasm'
      );
    });

    it('keeps an absolute path at the server root', () => {
      process.env.PUBLIC_URL = '/pacs/';

      expect(resolveApplicationUrl('/assets/x.wasm')).toBe(
        'http://localhost/assets/x.wasm'
      );
    });

    it('uses a full URL as given', () => {
      expect(resolveApplicationUrl('https://cdn.example.com/x.wasm')).toBe(
        'https://cdn.example.com/x.wasm'
      );
    });

    it('resolves a full URL base as given', () => {
      globalThis.PUBLIC_URL = 'http://cdn.example.com/app/';

      expect(resolveApplicationUrl('assets/x.wasm')).toBe(
        'http://cdn.example.com/app/assets/x.wasm'
      );
    });

    it('yields the base itself for an empty path', () => {
      process.env.PUBLIC_URL = '/pacs/';

      expect(resolveApplicationUrl()).toBe('http://localhost/pacs/');
    });
  });

  describe('resolveWasmBasePath', () => {
    it('resolves the default directory against the application', () => {
      navigateTo('/viewer/dicomweb');

      expect(resolveWasmBasePath('ort/')).toBe('http://localhost/ort/');
    });

    it('resolves the default directory against a sub-path base', () => {
      process.env.PUBLIC_URL = '/pacs/';
      navigateTo('/pacs/viewer/dicomweb');

      expect(resolveWasmBasePath('ort/')).toBe('http://localhost/pacs/ort/');
    });

    describe('with a configured directory', () => {
      it('takes it in preference to the default one', () => {
        setWasmBasePath('/assets/cs-wasm/');
        process.env.PUBLIC_URL = '/pacs/';
        navigateTo('/pacs/viewer/dicomweb');

        expect(resolveWasmBasePath('ort/')).toBe(
          'http://localhost/assets/cs-wasm/'
        );
      });

      it('uses a full URL as given', () => {
        setWasmBasePath('https://cdn.example.com/wasm/');

        expect(resolveWasmBasePath('ort/')).toBe(
          'https://cdn.example.com/wasm/'
        );
      });

      it('adds the trailing slash it may be missing', () => {
        setWasmBasePath('/assets/cs-wasm');

        expect(resolveWasmBasePath('ort/')).toBe(
          'http://localhost/assets/cs-wasm/'
        );
      });

      it('resolves a relative one against the application', () => {
        setWasmBasePath('cs-wasm/');
        process.env.PUBLIC_URL = '/pacs/';
        navigateTo('/pacs/viewer/dicomweb');

        expect(resolveWasmBasePath('ort/')).toBe(
          'http://localhost/pacs/cs-wasm/'
        );
      });

      it('reports it unresolved through getWasmBasePath', () => {
        setWasmBasePath('/assets/cs-wasm/');

        expect(getWasmBasePath()).toBe('/assets/cs-wasm/');
      });

      it('is cleared by an empty value', () => {
        setWasmBasePath('/assets/cs-wasm/');
        setWasmBasePath('');

        expect(getWasmBasePath()).toBeUndefined();
        expect(resolveWasmBasePath('ort/')).toBe('http://localhost/ort/');
      });
    });
  });
});
