/**
 * ONNX Runtime fetches its WebAssembly binaries from the prefix held in
 * `ort.env.wasm.wasmPaths` and feeds whatever comes back straight to
 * `WebAssembly.instantiateStreaming`.
 *
 * Every other wasm binary in this repository is located with
 * `new URL(<specifier>, import.meta.url)` — the bundler resolves the file,
 * emits it, and hands back an absolute URL that does not depend on the page
 * the user is currently on. `onnxruntime-web@1.17` cannot be addressed that
 * way: its `exports` map publishes only the JavaScript entry points, so
 * `new URL('onnxruntime-web/dist/ort-wasm-simd.jsep.wasm', import.meta.url)`
 * fails to resolve. Applications copy `onnxruntime-web/dist` next to their
 * bundle instead — the example runner copies it to `<example>/ort`
 * (`utils/ExampleRunner/template-config.js`) — and point the runtime there.
 *
 * Pointing at it with a bare `'ort/'` is the part that breaks. A
 * document-relative prefix resolves against the current *route*, not against
 * the application, so it only finds the copy when the page sits exactly one
 * segment deep — which is why it works for the examples and for
 * `viewer.ohif.org/segmentation`. A viewer served from `/viewer/dicomweb`
 * requests `/viewer/ort/ort-wasm-*.wasm`, receives the SPA fallback's
 * `index.html`, and ONNX dies with `expected magic word 00 61 73 6d, found
 * 3c 21 64 6f` followed by "no available backend found".
 *
 * So resolve the prefix against where the *application* is served from, never
 * against the current document URL. In order of authority:
 *
 * 1. the bundler's own asset base, when it exposes one — the examples and the
 *    docs site rely on this, since the copy of `onnxruntime-web/dist` sits
 *    beside the emitted bundle rather than at the server root;
 * 2. `PUBLIC_URL`, the base applications inject for exactly this purpose;
 * 3. `document.baseURI`, but only when the page carries an explicit
 *    `<base href>` — that element *is* a declaration of the application root,
 *    whereas a bare `document.baseURI` is just the route;
 * 4. `'/'`, the server root, which is where a copy next to the bundle lands
 *    for an application served from the root — the load path a page one
 *    segment deep already resolved `'ort/'` to.
 */

/** Directory applications copy `onnxruntime-web/dist` into. */
export const DEFAULT_ORT_WASM_DIRECTORY = 'ort/';

/**
 * Public base assumed when nothing declares one. Applications are served from
 * the root far more often than from a sub-path, and a wrong guess here is a
 * 404 rather than a wasm binary — so guess the common case.
 */
export const DEFAULT_PUBLIC_URL = '/';

/**
 * webpack and rspack replace this identifier with the bundle's runtime public
 * path (`output.publicPath` / `assetPrefix`, or the script's own directory
 * when that is `'auto'`). It is declared rather than imported because other
 * bundlers leave it undefined — the `typeof` guard below covers them.
 */
declare const __webpack_public_path__: string | undefined;

/**
 * Declared for the same reason: `process` does not exist in a browser, and
 * bundlers that do substitute `process.env.PUBLIC_URL` do it by matching that
 * exact expression, so it has to be spelled out rather than reached through
 * `globalThis`.
 */
declare const process: { env: Record<string, string | undefined> } | undefined;

/**
 * The base a bundler anchors its emitted asset URLs to. This is the definition
 * webpack and rspack generate for `__webpack_require__.b`, which is what
 * `new URL(<specifier>, import.meta.url)` compiles down to — so the runtime
 * binaries end up resolved against the same base as the codec wasm.
 */
function getBundlePublicPath(): string | undefined {
  return typeof __webpack_public_path__ === 'string' && __webpack_public_path__
    ? __webpack_public_path__
    : undefined;
}

/**
 * The public base the application injected: `process.env.PUBLIC_URL` for a
 * build-time substitution (Create React App and friends), `PUBLIC_URL` on the
 * global for a runtime one — the spelling `utils/demo/helpers/initDemo.ts`
 * already uses for `dicom-microscopy-viewer`.
 */
function getInjectedPublicUrl(): string | undefined {
  const injected =
    (typeof process !== 'undefined' && process.env.PUBLIC_URL) ||
    (globalThis as { PUBLIC_URL?: string }).PUBLIC_URL;

  return typeof injected === 'string' && injected ? injected : undefined;
}

/**
 * `document.baseURI`, but only when a `<base href>` element put it there.
 * Without that element `baseURI` is just the current route, which is the thing
 * this module exists to stop resolving against.
 */
function getExplicitDocumentBase(): string | undefined {
  if (typeof document === 'undefined' || !document.querySelector) {
    return undefined;
  }

  return document.querySelector('base[href]')
    ? document.baseURI || undefined
    : undefined;
}

/**
 * Something absolute to anchor a path-only base (`/pacs/`) against. Only its
 * origin survives that resolution — the route never does.
 */
function getAbsoluteReference(): string | undefined {
  return (
    (typeof document !== 'undefined' && document.baseURI) ||
    globalThis.location?.href
  );
}

/**
 * Where the application is served from, in the order documented above.
 *
 * The result always names a directory. `PUBLIC_URL=/pacs` is a common
 * spelling, and URL resolution would treat that last segment as a file and
 * discard it — turning `/pacs/ort/` back into `/ort/`.
 */
function getApplicationBase(): string {
  const base =
    getBundlePublicPath() ??
    getInjectedPublicUrl() ??
    getExplicitDocumentBase() ??
    DEFAULT_PUBLIC_URL;

  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Absolute URL prefix for the ONNX Runtime wasm binaries.
 *
 * @param directory - directory holding `onnxruntime-web/dist`, relative to the
 *   application. An absolute path or a full URL is used as given, so an
 *   application serving the binaries from a CDN or a versioned path can say
 *   so. Defaults to `ort/`.
 * @returns the prefix as an absolute URL, or `directory` unchanged when there
 *   is nothing to resolve it against (a non-browser context).
 */
export default function getOrtWasmPaths(
  directory = DEFAULT_ORT_WASM_DIRECTORY
): string {
  const applicationBase = getApplicationBase();
  const reference = getAbsoluteReference();

  try {
    // The application base is rarely a full URL (`/pacs/`, or `'auto'` in a
    // worker), so anchor it before the directory is resolved against it.
    const base = reference
      ? new URL(applicationBase, reference)
      : new URL(applicationBase);

    return new URL(directory, base).href;
  } catch {
    return directory;
  }
}
