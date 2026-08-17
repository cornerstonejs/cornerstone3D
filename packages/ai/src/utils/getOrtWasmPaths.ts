/**
 * ONNX Runtime fetches its WebAssembly binaries from the prefix held in
 * `ort.env.wasm.wasmPaths` and feeds whatever comes back straight to
 * `WebAssembly.instantiateStreaming`.
 *
 * Every other wasm binary in this repository is located with
 * `new URL(<specifier>, import.meta.url)` — the bundler resolves the file,
 * emits it, and hands back an absolute URL that does not depend on the page the
 * user is currently on. `onnxruntime-web@1.17` cannot be addressed that way:
 * its `exports` map publishes only the JavaScript entry points, so
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
 * against the current document URL:
 *
 * 1. when the system-level wasm directory is set, these binaries live there,
 *    exactly like the codec binaries do — an application that already serves
 *    its wasm out of one place (`init({ wasmBasePath })` on
 *    `@cornerstonejs/dicom-image-loader`) does not need a second setting;
 * 2. otherwise `PUBLIC_URL`, the base an application declares for itself,
 *    defaulting to `'/'` when nothing declares one;
 * 3. with the directory resolved against that base, anchored at the page's
 *    origin — the protocol and host of `window.location` and nothing more,
 *    which is how `dicom-microscopy-viewer` has always located its own assets
 *    from `PUBLIC_URL`. The route never takes part.
 */
import { utilities } from '@cornerstonejs/core';

/** Directory applications copy `onnxruntime-web/dist` into. */
export const DEFAULT_ORT_WASM_DIRECTORY = 'ort/';

/**
 * Base assumed when nothing declares one. Applications are served from the root
 * far more often than from a sub-path, and it is the same default every other
 * reader of `PUBLIC_URL` picks.
 */
export const DEFAULT_PUBLIC_URL = '/';

/**
 * Declared because `process` does not exist in a browser, and the bundlers that
 * substitute `process.env.PUBLIC_URL` do it by matching that exact expression —
 * so it has to be spelled out rather than reached through `globalThis`.
 */
declare const process: { env: Record<string, string | undefined> };

/** Trailing slash, so URL resolution treats the value as a directory. */
function asDirectory(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * `PUBLIC_URL` as a build-time substitution (Create React App and friends).
 *
 * A `typeof process !== 'undefined'` guard would be the obvious way to write
 * this and does not work: bundlers rewrite `process.env.PUBLIC_URL` but leave
 * the `typeof` check alone, and it is false in every browser bundle, so the
 * substituted value would never be read. Catching the reference error is what
 * is left.
 */
function getBuildTimePublicUrl(): string | undefined {
  try {
    return process.env.PUBLIC_URL || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The base the application declares for itself. `PUBLIC_URL` on the global is
 * the runtime spelling `utils/demo/helpers/initDemo.ts` sets and
 * `dicom-microscopy-viewer` reads; `config.path` is the same value carried in a
 * viewer's configuration object.
 */
function getPublicUrl(): string {
  const globals = globalThis as {
    PUBLIC_URL?: string;
    config?: { path?: string };
  };

  return (
    globals.PUBLIC_URL ||
    globals.config?.path ||
    getBuildTimePublicUrl() ||
    DEFAULT_PUBLIC_URL
  );
}

/**
 * The page's origin, and nothing else. `PUBLIC_URL` is usually a path
 * (`/pacs/`) and needs something absolute to resolve against, but the route is
 * exactly what this module exists to keep out of the result — so hand over the
 * protocol and host alone rather than `location.href` or `document.baseURI`.
 */
function getOrigin(): string | undefined {
  const { location } = globalThis;

  return location ? `${location.protocol}//${location.host}` : undefined;
}

/**
 * Absolute URL prefix for the ONNX Runtime wasm binaries.
 *
 * @param directory - directory holding `onnxruntime-web/dist`. Resolved against
 *   the application base, so `'assets/ort/'` is relative to the application,
 *   `'/ort/'` to the server root, and a full URL is used as given — an
 *   application serving the binaries from a CDN or a versioned path can say so.
 *   Passing this overrides the system-level wasm directory. Defaults to the
 *   system-level directory when one is set, otherwise to `ort/`.
 * @returns the prefix as an absolute URL, or the directory unchanged when there
 *   is nothing to resolve it against (a non-browser context).
 */
export default function getOrtWasmPaths(directory?: string): string {
  const prefix = asDirectory(
    directory ?? utilities.getWasmBasePath() ?? DEFAULT_ORT_WASM_DIRECTORY
  );
  const publicUrl = asDirectory(getPublicUrl());
  const origin = getOrigin();

  try {
    const base = origin ? new URL(publicUrl, origin) : new URL(publicUrl);

    return new URL(prefix, base).href;
  } catch {
    return prefix;
  }
}
