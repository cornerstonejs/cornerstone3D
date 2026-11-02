import { utilities } from '@cornerstonejs/core';
import type { LoaderOptions } from '../../types';

let options: LoaderOptions = {
  // callback to open the object
  open(xhr, url) {
    xhr.open('get', url, true);
  },
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend: async (/* xhr, imageId */) => {
    // before send code
  },
  // callback allowing modification of the xhr response before creating image objects
  beforeProcessing(xhr: XMLHttpRequest) {
    return Promise.resolve(xhr.response as ArrayBuffer);
  },
  // callback allowing modification of newly created image objects
  imageCreated(/* image */) {
    // image created code
  },
  strict: false,
};

export function setOptions(newOptions: LoaderOptions): void {
  options = Object.assign(options, newOptions);

  // The wasm directory is not private to this loader: it is where every
  // Cornerstone package looks for its binaries, so publish it system-wide.
  // Options without the key leave the current value alone, matching the
  // decode-config behaviour in `shared/wasmBasePath`.
  if (newOptions.wasmBasePath !== undefined) {
    utilities.setWasmBasePath(newOptions.wasmBasePath);
  }
}

export function getOptions(): LoaderOptions {
  return options;
}
