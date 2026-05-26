import { peerImport } from '@cornerstonejs/core';
import type { WebWorkerDecodeConfig } from '../types';

export interface CreateInitializeDecoderOptions<TModule = unknown> {
  /**
   * The already-imported codec library.
   *
   * This can be either:
   * - A WASM JS loader module that exposes `default(initOpts) => Promise<TModule>` (Emscripten-style), or
   * - The initialized codec module itself (TModule).
   */
  library?: unknown;
  /**
   * Peer import id for the WASM JS loader, used only when `library` is not provided
   * (e.g. '@cornerstonejs/codec-charls/decodewasmjs').
   */
  libraryName?: string;
  /**
   * Fallback when no peer provides the library; typically `() => import('...decodewasmjs')`.
   * Only used when `library` is not provided.
   */
  libraryFallback?: () => Promise<unknown>;
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
 * either a provided `library` module or via peerImport(libraryName, libraryFallback),
 * resolves the WASM URL via peerImport(wasm) with wasmDefaultUrl as fallback, and
 * instantiates the decoder via `new codec[constructor]()`.
 *
 * Use the returned `state` as the module's local ref for codec, decoder, and
 * decodeConfig (e.g. `const local = state`).
 */
export function createInitializeDecoder<TModule = unknown, TDecoder = unknown>(
  opts: CreateInitializeDecoderOptions<TModule>
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

    const lib =
      opts.library ??
      (opts.libraryName
        ? await peerImport(opts.libraryName, opts.libraryFallback)
        : await opts.libraryFallback?.());
    if (!lib) {
      throw new Error(
        'createInitializeDecoder: no codec library provided. Pass `library`, or provide `libraryName` and `libraryFallback`.'
      );
    }
    const wasmModule = await peerImport(opts.wasm, () => ({
      default: opts.wasmDefaultUrl,
    }));
    const wasmUrl = wasmModule?.default;
    const locateFileOpts = {
      locateFile: (file: string) =>
        file.endsWith('.wasm') ? wasmUrl : undefined,
    };
    const codec = await (async () => {
      // Accept either an init-wrapper module (module.default(initOpts)) or an already-initialized codec module.
      if (
        typeof lib === 'object' &&
        lib !== null &&
        'default' in lib &&
        typeof (lib as { default?: unknown }).default === 'function'
      ) {
        return (await (
          lib as { default: (initOpts?: object) => Promise<TModule> }
        ).default(locateFileOpts)) as TModule;
      }

      if (typeof lib === 'function') {
        return (await (lib as (initOpts?: object) => Promise<TModule>)(
          locateFileOpts
        )) as TModule;
      }

      return lib as TModule;
    })();

    state.codec = codec;
    state.decoder = new (codec as Record<string, new () => unknown>)[
      opts.constructor
    ]() as TDecoder;
  };

  return { initialize, state };
}
