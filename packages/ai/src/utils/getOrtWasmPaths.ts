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
 * fails to resolve. Applications copy `onnxruntime-web/dist` somewhere they
 * serve instead — the example runner copies it to `<example>/ort`
 * (`utils/ExampleRunner/template-config.js`) — and point the runtime there.
 *
 * That makes it the same problem the codec binaries have, and it gets the same
 * answer: `utilities.resolveWasmBasePath` in `@cornerstonejs/core`, which
 * prefers the wasm directory the application declared and otherwise resolves
 * the standard directory against the application's base. All this module adds
 * is the standard directory name.
 *
 * Those two are the whole story, and there is deliberately no third way to name
 * the location here. Since the binaries cannot be reached from this module,
 * there is nothing to fall back to: an application serving them from somewhere
 * else says so with `init({ wasmBasePath })`, or declares where it is mounted
 * with `PUBLIC_URL`, or assigns `ort.env.wasm.wasmPaths` itself — which the
 * controller leaves alone.
 *
 * When `onnxruntime-web` is eventually bumped to >= 1.21 its
 * `*.bundle.min.mjs` builds resolve their own `.wasm` through `import.meta.url`
 * and this module can be deleted.
 */
import { utilities } from '@cornerstonejs/core';

/** Directory applications copy `onnxruntime-web/dist` into. */
export const DEFAULT_ORT_WASM_DIRECTORY = 'ort/';

/**
 * Absolute URL prefix for the ONNX Runtime wasm binaries: the wasm directory the
 * application configured, or `ort/` under the application's base.
 *
 * @returns the prefix as an absolute URL, or the directory unchanged when there
 *   is nothing to resolve it against (a non-browser context).
 */
export default function getOrtWasmPaths(): string {
  return utilities.resolveWasmBasePath(DEFAULT_ORT_WASM_DIRECTORY);
}
