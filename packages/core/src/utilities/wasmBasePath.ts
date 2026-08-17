/**
 * Where Cornerstone loads its WebAssembly binaries from.
 *
 * A wasm binary cannot be located the way a bundled asset is. The usual
 * `new URL(<specifier>, import.meta.url)` only works when the bundler resolves,
 * emits and hashes the file, and several of the binaries Cornerstone needs
 * cannot be reached that way: the decoders name their codecs with bare
 * `@cornerstonejs/codec-...` specifiers, which bundlers do not rewrite inside
 * `new URL(...)`, and `onnxruntime-web@1.17` publishes only JavaScript entry
 * points in its `exports` map. An application therefore copies those binaries
 * somewhere it serves and *declares* where they are.
 *
 * Declaring it once is the point of `wasmBasePath`: one directory holding every
 * binary, set through `init({ wasmBasePath })` on
 * `@cornerstonejs/dicom-image-loader` (see `LoaderOptions.wasmBasePath`) and
 * recorded here rather than privately in the loader, so that every package
 * locating a binary honours the same directory.
 *
 * When nothing declares one, each set of binaries falls back to the standard
 * directory its owner copies them into, resolved against the application rather
 * than against the current document — see `resolveApplicationUrl` for why that
 * distinction is the whole point.
 */
import resolveApplicationUrl from './resolveApplicationUrl';

/** Directory every wasm binary is loaded from, or undefined for the default. */
let wasmBasePath: string | undefined;

/**
 * Sets the directory every wasm binary is loaded from. Pass undefined (or an
 * empty string) to restore each consumer's own default resolution.
 *
 * `init({ wasmBasePath })` on `@cornerstonejs/dicom-image-loader` calls this,
 * so applications configuring the loader do not need to call it themselves.
 */
export function setWasmBasePath(basePath?: string): void {
  wasmBasePath = basePath || undefined;
}

/** The configured wasm directory, or undefined when nothing has set one. */
export function getWasmBasePath(): string | undefined {
  return wasmBasePath;
}

/**
 * Absolute URL of the directory a set of wasm binaries loads from.
 *
 * @param defaultDirectory - directory to use when nothing has declared one: the
 *   standard location its owner copies the binaries into, e.g. `ort/` for the
 *   ONNX Runtime. Both it and a configured `wasmBasePath` are resolved the same
 *   way — relative to the application, or to the server root when absolute, or
 *   used as given when a full URL.
 * @returns the directory as an absolute URL with a trailing slash, or the
 *   unresolved directory when there is nothing to resolve it against (a
 *   non-browser context).
 */
export function resolveWasmBasePath(defaultDirectory = ''): string {
  const directory = wasmBasePath || defaultDirectory;

  // A trailing slash, so the value resolves as a directory rather than having
  // its last segment discarded as a file name. An empty directory stays empty:
  // it resolves to the application's base itself, not to the server root.
  return resolveApplicationUrl(
    !directory || directory.endsWith('/') ? directory : `${directory}/`
  );
}
