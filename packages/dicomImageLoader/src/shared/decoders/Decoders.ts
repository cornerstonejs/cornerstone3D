import type { LoaderDecodeOptions } from '../../types';

/**
 * Available decoder names for preloading
 */
export type DecoderName =
  | 'htj2k'
  | 'jpeg2000'
  | 'jpegls'
  | 'jpegbaseline8bit'
  | 'jpegbaseline12bit'
  | 'jpeglossless';

/**
 * Map of decoder names to their initialize functions
 */
const decoderInitializers = new Map<
  DecoderName,
  (config?: unknown) => Promise<void>
>();

/**
 * Register a decoder's initialize function
 * @param name - Decoder name
 * @param initializer - Initialize function
 */
function registerDecoder(
  name: DecoderName,
  initializer: (config?: unknown) => Promise<void>
): void {
  decoderInitializers.set(name, initializer);
}

/**
 * Initialize decoder initializers map
 * TODO: Move these all down below
 */
async function initializeDecoderMap(): Promise<void> {
  // Dynamically import decoders to avoid circular dependencies
  const [jpeg2000, jpegls, jpegbaseline8bit, jpegbaseline12bit, jpeglossless] =
    await Promise.all([
      import('./decodeHTJ2K'),
      import('./decodeJPEG2000'),
      import('./decodeJPEGLS'),
      import('./decodeJPEGBaseline8Bit'),
      import('./decodeJPEGBaseline12Bit-js'),
      import('./decodeJPEGLossless'),
    ]);

  // Wrap initialize functions to handle type mismatches
  registerDecoder('jpeg2000', () => jpeg2000.initialize());
  registerDecoder('jpegls', () => jpegls.initialize());
  registerDecoder('jpegbaseline8bit', () => jpegbaseline8bit.initialize());
  registerDecoder('jpegbaseline12bit', () => jpegbaseline12bit.initialize());
  registerDecoder('jpeglossless', () => jpeglossless.initialize());
}

export interface IDecoder {
  decode(imageFrame, pixelData, opts);
}

export interface IDecoderConfig {
  loadDecoder(config): Promise<IDecoder>;
  preload?: boolean;
}

type DecoderConfig = IDecoderConfig & {
  instance?: IDecoder;
  initialize?: Promise<IDecoder>;
};

export class Decoders {
  private decoders = new Map<string, DecoderConfig>();

  private decodeConfig: Record<string, LoaderDecodeOptions>;

  public async preload(_decodeConfig?: LoaderDecodeOptions) {}

  public load(decoder: DecoderName): Promise<IDecoder> | IDecoder {
    return this._load(decoder);
  }

  /**
   * Loads a decoder, or gets the existing instance.  This will not start
   * loading a second instance of the same decoder if it is already loaded.
   */
  public _load(decoder: string): Promise<IDecoder> | IDecoder {
    const existing = this.decoders.get(decoder);
    if (!existing) {
      throw new Error(`Couldn't find decoder ${decoder}`);
    }
    if (!existing.initialize) {
      existing.initialize = existing.loadDecoder(
        this.createConfig(decoder, existing)
      );
      existing.initialize.then((decoder) => (existing.instance = decoder));
      return existing.initialize;
    }
    return existing.instance || existing.initialize;
  }

  protected createConfig(decoder: string, existing: DecoderConfig) {
    const useConfig = Object.create(existing);
    const extraConfig = this.decodeConfig?.[decoder];
    if (extraConfig) {
      Object.assign(useConfig, extraConfig);
    }
    return useConfig;
  }

  public registerDecoder(decoder: string, config: IDecoderConfig) {
    this.decoders.set(decoder, config);
  }

  public setConfiguration(decodeConfig: Record<string, LoaderDecodeOptions>) {
    this.decodeConfig = decodeConfig;
  }

  public getDecoderNames() {
    return Object.keys(this.decoders);
  }

  public isPreload(name: string) {
    if (this.decodeConfig?.[name]?.preload !== undefined) {
      return this.decodeConfig[name].preload;
    }
    return this.decoders[name].preload;
  }
}

export const decoders = new Decoders();

decoders.registerDecoder('htj2k', {
  loadDecoder: async (config) => {
    const module = await import('./decodeHTJ2K');
    const { initialize } = module;
    await initialize(config);
    return {
      decode: (_loadimageFrame, pixelData, opts) => {
        return module.decodeAsync(pixelData, opts);
      },
    };
  },

  preload: false,
});

/**
 * Preload specified image decoders or all available decoders
 * @param decoders - Array of decoder names to preload, or true to preload all
 * @param decodeConfig - Optional decode configuration
 * @returns Promise that resolves when all decoders are preloaded
 */
export function preloadDecoders(
  decodeConfig?: Record<string, LoaderDecodeOptions>
): Promise<unknown> {
  decoders.setConfiguration(decodeConfig);
  const preload = [];
  for (const decoderName of decoders.getDecoderNames()) {
    if (decoders.isPreload(decoderName)) {
      preload.push(decoders._load(decoderName));
    }
  }
  return Promise.all(preload);
}

export default decoders;
