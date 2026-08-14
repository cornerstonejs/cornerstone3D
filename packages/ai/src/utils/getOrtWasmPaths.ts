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
 * So resolve the prefix against the base the bundler already uses for the
 * assets it emits, which is the directory the copy lives in.
 */

/** Directory applications copy `onnxruntime-web/dist` into. */
export const DEFAULT_ORT_WASM_DIRECTORY = 'ort/';

/**
 * webpack and rspack replace this identifier with the bundle's runtime public
 * path (`output.publicPath` / `assetPrefix`, or the script's own directory
 * when that is `'auto'`). It is declared rather than imported because other
 * bundlers leave it undefined — the `typeof` guard below covers them.
 */
declare const __webpack_public_path__: string | undefined;

function getBundlePublicPath(): string | undefined {
  return typeof __webpack_public_path__ === 'string' && __webpack_public_path__
    ? __webpack_public_path__
    : undefined;
}

/**
 * The base a bundler anchors its emitted asset URLs to. This is the definition
 * webpack and rspack generate for `__webpack_require__.b`, which is what
 * `new URL(<specifier>, import.meta.url)` compiles down to — so the runtime
 * binaries end up resolved against the same base as the codec wasm.
 */
function getDocumentBase(): string | undefined {
  return (
    (typeof document !== 'undefined' && document.baseURI) ||
    globalThis.location?.href
  );
}

/**
 * Absolute URL prefix for the ONNX Runtime wasm binaries.
 *
 * @param directory - directory holding `onnxruntime-web/dist`, relative to the
 *   application. Defaults to `ort/`.
 * @returns the prefix as an absolute URL, or `directory` unchanged when there
 *   is nothing to resolve it against (a non-browser context).
 */
export default function getOrtWasmPaths(
  directory = DEFAULT_ORT_WASM_DIRECTORY
): string {
  const documentBase = getDocumentBase();
  const base = getBundlePublicPath() ?? documentBase;

  if (!base || !documentBase) {
    return directory;
  }

  try {
    // The public path is rarely a full URL (`/pacs/`, or `auto` in a worker),
    // so anchor it before the directory is resolved against it.
    return new URL(directory, new URL(base, documentBase)).href;
  } catch {
    return directory;
  }
}
