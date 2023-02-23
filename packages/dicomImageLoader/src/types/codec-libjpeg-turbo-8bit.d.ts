/// <reference types="emscripten" />

declare module '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode' {
  export class LibJpegTurbo8Bit {
    decode: () => any;
    getDecodedBuffer: () => any;
    getEncodedBuffer: (length: number) => any;
    getFrameInfo: () => any;
  }
  export interface OpenJpegModule extends EmscriptenModule {
    JPEGDecoder: typeof LibJpegTurbo8Bit;
  }
  declare const Module: EmscriptenModuleFactory<OpenJpegModule>;
  export default Module;
}
