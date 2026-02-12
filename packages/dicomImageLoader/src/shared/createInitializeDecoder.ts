import { peerImport } from '@cornerstonejs/core';
import type { WebWorkerDecodeConfig } from '../types';

export interface CreateInitializeDecoderOptions {
  /** Peer import id for the WASM JS loader (e.g. '@cornerstonejs/codec-charls/decodewasmjs'). */
  library: string;
  /** Fallback when no peer provides the library; typically () => import('...decodewasmjs'). */
  libraryFallback: () => Promise<{
    default: (opts?: object) => Promise<unknown>;
  }>;
  /** Peer import id for the WASM binary (e.g. '@cornerstonejs/codec-charls/decodewasm'). */
  wasm: string;
  /** Default WASM URL for the bundler; pass e.g. new URL('...decodewasm', import.meta.url).toString(). */
  wasmDefaultUrl: string;
  /** Name of the decoder class on the loaded module (e.g. 'JpegLSDecoder'). */
  constructor: string;
}

export interface InitializeDecoderState<TModule = unknown, TDecoder = unknown> {
  codec: TModule;
  decoder: TDecoder;
  decodeConfig: WebWorkerDecodeConfig;
}

export type InitializeDecoderFn = (
  decodeConfig?: WebWorkerDecodeConfig
) => Promise<void>;

/**
 * Creates an initialize function and shared state for a WASM decoder that uses
 * locateFile (Emscripten-style). The returned initialize loads the JS module via
 * peerImport(library), resolves the WASM URL via peerImport(wasm) with wasmDefaultUrl
 * as fallback, and instantiates the decoder via `new codec[constructor]()`.
 *
 * Use the returned `state` as the module's local ref for codec, decoder, and
 * decodeConfig (e.g. `const local = state`).
 */
export function createInitializeDecoder<TModule = unknown, TDecoder = unknown>(
  opts: CreateInitializeDecoderOptions
): {
  initialize: InitializeDecoderFn;
  state: InitializeDecoderState<TModule, TDecoder>;
} {
  const state: InitializeDecoderState<TModule, TDecoder> = {
    codec: undefined as TModule,
    decoder: undefined as TDecoder,
    decodeConfig: {} as WebWorkerDecodeConfig,
  };

  const initialize: InitializeDecoderFn = async (decodeConfig) => {
    state.decodeConfig = decodeConfig ?? state.decodeConfig;

    if (state.codec) {
      return;
    }

    const mod = await peerImport(opts.library, opts.libraryFallback);
    const wasmModule = await peerImport(opts.wasm, () => ({
      default: opts.wasmDefaultUrl,
    }));
    const wasmUrl = wasmModule?.default;
    const locateFileOpts = {
      locateFile: (file: string) =>
        file.endsWith('.wasm') ? wasmUrl : undefined,
    };
    const codec = (await (
      mod as { default: (initOpts?: object) => Promise<TModule> }
    ).default(locateFileOpts)) as TModule;

    state.codec = codec;
    state.decoder = new (codec as Record<string, new () => unknown>)[
      opts.constructor
    ]() as TDecoder;
  };

  return { initialize, state };
}
