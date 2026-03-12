# Configuration

The Cornerstone WADO Image Loader can be configured by the following:

```js
CornerstoneDICOMImageLoader.init(options);
```

Where options can have the following properties:

- beforeSend - A callback that is executed before a network request. passes the
  `XMLHttpRequest` object.
- onloadend - Callback triggered when downloading an image ends. Passes the
  event and params object.
- onreadystatechange - Callback triggered on state change of request. Passes the
  event and params object.
- onprogress - Callback triggered when download progress event is fired.
  Progress. Passes the event and params object.
- errorInterceptor - Callback which may be used to deal with errors. Passes an
  Error object with these additional properties:
  - `request` - The `XMLHttpRequest` object.
  - `response` - The `response`, if any.
  - `status` - The HTTP `status` code.
- imageCreated - Callback allowing modification of newly created image objects.
- decodeConfig - The configuration for the decoder
- strict - Whether strict mode for image decoding is on.

## Loading codecs and WASM via peerImport

WASM-based decoders (JPEG-LS, JPEG 2000, HTJ2K, JPEG Baseline 8-bit) load two things at runtime:

1. **The codec JS module** – the Emscripten-generated glue that compiles and instantiates the WASM (e.g. `@cornerstonejs/codec-charls/decodewasmjs`).
2. **The WASM binary** – the actual `.wasm` file (e.g. `@cornerstonejs/codec-charls/decodewasm`).

Both are resolved through **peerImport**, which is provided by the host application when it initializes Cornerstone (e.g. `cornerstone.init({ peerImport })`). The DICOM Image Loader calls `peerImport(moduleId, fallback)`:

- **Codec module:** `peerImport(libraryId, libraryFallback)` – the loader expects the returned promise to resolve to an object with a `default` function (the Emscripten factory). If the host does not handle that `libraryId`, the `libraryFallback` is used (typically a static `import(...)` so the bundler can resolve the default path).
- **WASM URL:** `peerImport(wasmId, () => ({ default: wasmDefaultUrl }))` – the loader expects the returned promise to resolve to an object with a `default` string: the URL of the `.wasm` file. That URL is passed to the codec’s `locateFile` so the Emscripten loader can fetch the binary. If the host does not handle that `wasmId`, the fallback returns the default URL (derived from the package at build time).

This design allows the host to:

- Use different bundling or loading (e.g. load the codec from a CDN or a different path).
- Serve the WASM from a different origin or path (e.g. same CDN, or a custom asset server) without changing the DICOM Image Loader or codec packages.

### Registering a custom peerImport

`peerImport` is configured on **Cornerstone (core)**, not on the DICOM Image Loader. Pass it when you call `init()`:

```js
import { init } from '@cornerstonejs/core';

async function myPeerImport(moduleId, fallback) {
  // Override WASM URLs for a specific environment (e.g. CDN)
  if (moduleId === '@cornerstonejs/codec-charls/decodewasm') {
    return {
      default: 'https://my-cdn.example.com/assets/codec-charls-decodewasm.wasm',
    };
  }
  if (moduleId === '@cornerstonejs/codec-openjph/wasm') {
    return {
      default: 'https://my-cdn.example.com/assets/codec-openjph-wasm.wasm',
    };
  }
  // Optional: override the JS module as well
  // if (moduleId === '@cornerstonejs/codec-charls/decodewasmjs') {
  //   return import('https://my-cdn.example.com/codec-charls-decodewasmjs.js');
  // }
  // Let the default (bundled) resolution take over
  if (fallback) return fallback();
  return null;
}

await init({
  peerImport: myPeerImport,
  // ...other cornerstone config
});
```

### Module IDs used by the DICOM Image Loader

| Codec               | Library (JS) module ID                                 | WASM module ID                                       |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| JPEG-LS             | `@cornerstonejs/codec-charls/decodewasmjs`             | `@cornerstonejs/codec-charls/decodewasm`             |
| JPEG 2000           | `@cornerstonejs/codec-openjpeg/decodewasmjs`           | `@cornerstonejs/codec-openjpeg/decodewasm`           |
| HTJ2K               | `@cornerstonejs/codec-openjph/wasmjs`                  | `@cornerstonejs/codec-openjph/wasm`                  |
| JPEG Baseline 8-bit | `@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs` | `@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm` |

Return values:

- For **library** IDs: resolve with the module object (e.g. `{ default: factoryFunction }`).
- For **WASM** IDs: resolve with `{ default: string }` where the string is the absolute URL of the `.wasm` file.
