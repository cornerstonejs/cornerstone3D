/// <reference types="emscripten" />

declare module '@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode' {
  export class J2KDecoder {
    decode: () => any;
    getBlockDimensions: () => any;
    getColorSpace: () => any;
    getDecodedBuffer: () => any;
    getEncodedBuffer: (length: number) => any;
    getFrameInfo: () => any;
    getImageOffset: () => any;
    getIsReversible: () => any;
    getNumDecompositions: () => any;
    getNumLayers: () => any;
    getProgressionOrder: () => number;
    getTileOffset: () => any;
    getTileSize: () => any;
  }
  export interface OpenJpegModule extends EmscriptenModule {
    J2KDecoder: typeof J2KDecoder;
  }
  declare const Module: EmscriptenModuleFactory<OpenJpegModule>;
  export default Module;
}
