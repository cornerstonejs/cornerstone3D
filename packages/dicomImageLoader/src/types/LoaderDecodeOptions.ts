export interface LoaderDecodeOptions {
  // whatever
  /**
   * Specifies the url/path to the codec wasm files.  If specified, the wasm
   * blobs will be fetched from these paths rather than the default.
   *
   * By default, the codec wasm files are included in the end build by your
   * bundler (webpack, vite etc).
   *
   * Rather than using a bundler to identify the assets, it is possible to pass
   * in paths to where the wasm files should be loaded from. For instance, in
   * your build step extract the following wasm files and include them in your
   * static assets directory.  Then set the the correct paths to where
   * cornerstone should load the files.
   *
   * This should point to the export `@cornerstonejs/codec-charls/decodewasm`
   * that resolves to `@cornerstonejs/codec-charls/dist/charlswasm_decode.wasm`.
   * Copy this file to your static assets directory and set the path to it.
   *
   * @example `wasmUrlCodecCharls: '/static/charlswasm_decode.wasm'`
   */
  wasmUrlCodecCharls?: string;
  /**
   * Manually set the path/url to load `openjphjs.wasm`.  See the notes above
   * for detailed notes.
   *
   * This should point to the export `@cornerstonejs/codec-openjph/wasm` which
   * resolves to
   * `node_modules/@cornerstonejs/codec-openjph/dist/openjphjs.wasm`.
   *
   * @example `wasmUrlCodecOpenJph: '/static/openjphjs.wasm'`
   */
  wasmUrlCodecOpenJph?: string;
  /**
   * Manually set the path/url to load `openjpegwasm_decode.wasm`.  See the
   * notes above for detailed notes.
   *
   * This should point to the `@cornerstonejs/codec-openjpeg/decodewasm` which
   * resolves to `@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode.wasm`
   *
   * @example `wasmUrlCodecOpenJph: '/static/openjpegwasm_decode.wasm'`
   */
  wasmUrlCodecOpenJpeg?: string;
  /**
   * Manually set the path/url to load `libjpegturbowasm_decode.wasm`.  See the
   * notes above for detailed notes.
   *
   * This should point to the export
   * `@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm` which resolves to
   * `@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode.wasm`
   *
   * @example `wasmUrlCodecOpenJph: '/static/libjpegturbowasm_decode.wasm'`
   */
  wasmUrlCodecLibJpegTurbo8bit?: string;
}
