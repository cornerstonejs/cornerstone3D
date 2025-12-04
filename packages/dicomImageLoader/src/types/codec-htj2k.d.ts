/// <reference types="emscripten" />

declare module '@cornerstonejs/codec-openjph/wasmjs' {
  export interface FrameInfo {
    width: number;
    height: number;
    bitsPerSample: number;
    componentCount: number;
    isSigned: boolean;
    isUsingColorTransform: boolean;
  }
  export interface Point {
    x: number;
    y: number;
  }
  export interface Size {
    width: number;
    height: number;
  }
  export class HTJ2KDecoder {
    getEncodedBuffer(length: number): Uint8Array;
    getDecodedBuffer(): Uint8Array;
    decodeSubResolution(level: number): void;
    getFrameInfo(): FrameInfo;
    getImageOffset(): Point;
    getNumDecompositions(): number;
    getNumLayers(): number;
    getProgressionOrder(): number;
    getIsReversible(): boolean;
    getBlockDimensions(): Size;
    getTileSize(): Size;
    getTileOffset(): Point;
  }
  export interface HTJ2KModule extends EmscriptenModule {
    HTJ2KDecoder: typeof HTJ2KDecoder;
  }
  declare const Module: EmscriptenModuleFactory<HTJ2KModule>;
  export default Module;
}
