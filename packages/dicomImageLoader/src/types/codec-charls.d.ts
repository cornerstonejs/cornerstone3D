/// <reference types="emscripten" />

declare module '@cornerstonejs/codec-charls/dist/charlswasm_decode' {
  export class JpegLSDecoder {
    decode: () => any;
    getDecodedBuffer: () => any;
    getEncodedBuffer: (length: number) => any;
    getFrameInfo: () => any;
    getInterleaveMode: () => any;
    getNearLossless: () => any;
  }
  export interface CharlsModule extends EmscriptenModule {
    JpegLSDecoder: typeof JpegLSDecoder;
    getExceptionMessage: (exception: number) => any;
  }
  declare const Module: EmscriptenModuleFactory<CharlsModule>;
  export default Module;
}
