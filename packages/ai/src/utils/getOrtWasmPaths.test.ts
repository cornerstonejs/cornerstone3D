import getOrtWasmPaths from './getOrtWasmPaths';

type PublicUrlGlobal = typeof globalThis & {
  PUBLIC_URL?: string;
  __webpack_public_path__?: string;
};

const publicUrlGlobal = globalThis as PublicUrlGlobal;

/** Puts the document on `route` the way a client-side router would. */
function navigateTo(route: string) {
  window.history.replaceState(null, '', route);
}

function addBaseElement(href: string) {
  const base = document.createElement('base');
  base.setAttribute('href', href);
  document.head.appendChild(base);
}

describe('getOrtWasmPaths', () => {
  const publicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    delete publicUrlGlobal.PUBLIC_URL;
    delete publicUrlGlobal.__webpack_public_path__;
    delete process.env.PUBLIC_URL;
    document.head.querySelectorAll('base').forEach((base) => base.remove());
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

  it('tolerates a PUBLIC_URL without its trailing slash', () => {
    process.env.PUBLIC_URL = '/pacs';
    navigateTo('/pacs/viewer/dicomweb');

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('prefers the bundler public path over PUBLIC_URL', () => {
    // The examples and the docs site copy onnxruntime-web/dist beside the
    // emitted bundle, which is what the bundler public path points at.
    publicUrlGlobal.__webpack_public_path__ = 'http://cdn.example.com/app/';
    process.env.PUBLIC_URL = '/pacs/';

    expect(getOrtWasmPaths()).toBe('http://cdn.example.com/app/ort/');
  });

  it('ignores an empty bundler public path', () => {
    publicUrlGlobal.__webpack_public_path__ = '';
    process.env.PUBLIC_URL = '/pacs/';

    expect(getOrtWasmPaths()).toBe('http://localhost/pacs/ort/');
  });

  it('honours an explicit base element from a deep route', () => {
    addBaseElement('http://localhost/viewer/');
    navigateTo('/viewer/dicomweb/studies/1.2.3');

    expect(getOrtWasmPaths()).toBe('http://localhost/viewer/ort/');
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
