/**
 * Resolves the URL of a codec's WASM binary.
 *
 * By default each decoder locates its binary with a `new URL(...)` call whose
 * first argument is a bare `@cornerstonejs/codec-...` specifier. Bundlers do
 * not rewrite bare specifiers there, so applications that bundle the loader
 * have to patch the built worker to make the binaries resolvable.
 *
 * Setting a single base path avoids that: point it at one directory containing
 * the codec binaries, and every decoder loads
 * `<wasmBasePath>/<binary file name>` from it. There is deliberately no
 * per-codec configuration - one root for all of them.
 *
 * The base path is set from the loader option of the same name (see
 * `LoaderOptions.wasmBasePath`), which reaches the decode web worker through
 * the per-task decode config.
 */

/** Base path for all codec WASM binaries, or undefined for the default. */
let wasmBasePath: string | undefined;

/**
 * Sets the base path used to resolve every codec's WASM binary. Pass undefined
 * (or an empty string) to restore the default `import.meta.url` resolution.
 */
export function setWasmBasePath(basePath?: string): void {
  wasmBasePath = basePath || undefined;
}

/** Returns the configured base path, or undefined when unset. */
export function getWasmBasePath(): string | undefined {
  return wasmBasePath;
}

/**
 * Sets the base path from a decode config, if it carries one. Configs without
 * a `wasmBasePath` leave the current value alone, so a decode task cannot
 * accidentally clear a path set elsewhere.
 */
export function setWasmBasePathFromConfig(
  decodeConfig?: { wasmBasePath?: string } | undefined
): void {
  if (decodeConfig?.wasmBasePath !== undefined) {
    setWasmBasePath(decodeConfig.wasmBasePath);
  }
}

/**
 * Resolves the URL to load a codec's WASM binary from.
 *
 * @param fileName - binary's file name, e.g. `charlswasm_decode.wasm`
 * @param defaultUrl - the decoder's built-in `import.meta.url` based location,
 *   used when no base path is configured
 * @returns an absolute URL when one can be resolved, otherwise the joined path
 */
export function resolveWasmUrl(
  fileName: string,
  defaultUrl: URL | string
): string {
  if (!wasmBasePath) {
    return defaultUrl.toString();
  }

  const base = wasmBasePath.endsWith('/') ? wasmBasePath : `${wasmBasePath}/`;
  const path = `${base}${fileName}`;

  // Resolve relative base paths against the current location, which is the
  // worker script when decoding (matching what import.meta.url would give).
  // Absolute paths and full URLs are unaffected by this.
  const href = typeof self !== 'undefined' ? self.location?.href : undefined;

  if (!href) {
    return path;
  }

  try {
    return new URL(path, href).toString();
  } catch {
    return path;
  }
}
