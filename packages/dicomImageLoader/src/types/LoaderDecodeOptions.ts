export interface LoaderDecodeOptions {
  /**
   * Base path the codec WASM binaries are loaded from, e.g. `/assets/cs-wasm/`
   * or `https://cdn.example.com/cs-wasm/`. Applications normally set
   * `LoaderOptions.wasmBasePath` instead; that value is forwarded here so it
   * reaches the decode web worker.
   */
  wasmBasePath?: string;
}
