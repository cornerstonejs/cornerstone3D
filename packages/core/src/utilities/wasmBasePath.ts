/**
 * System-level location of the WebAssembly binaries Cornerstone loads at
 * runtime.
 *
 * The codec binaries the DICOM image loader decodes with are the reason this
 * exists. Each decoder resolves its binary against a bare
 * `@cornerstonejs/codec-...` specifier, which bundlers do not rewrite, so a
 * bundled application copies the binaries somewhere it serves and names that
 * directory once — `init({ wasmBasePath })` on the loader, see
 * `LoaderOptions.wasmBasePath`. That option is recorded here so it is not
 * private to the loader: any package that has to locate a wasm binary honours
 * the same directory, which is how `@cornerstonejs/ai` finds the ONNX Runtime
 * binaries (see `getOrtWasmPaths`).
 *
 * It is deliberately one directory for every binary rather than a path per
 * consumer — applications serve them all out of a single place.
 */

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
