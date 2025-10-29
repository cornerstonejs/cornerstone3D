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
 */
async function initializeDecoderMap(): Promise<void> {
  // Dynamically import decoders to avoid circular dependencies
  const [
    htj2k,
    jpeg2000,
    jpegls,
    jpegbaseline8bit,
    jpegbaseline12bit,
    jpeglossless,
  ] = await Promise.all([
    import('./decodeHTJ2K'),
    import('./decodeJPEG2000'),
    import('./decodeJPEGLS'),
    import('./decodeJPEGBaseline8Bit'),
    import('./decodeJPEGBaseline12Bit-js'),
    import('./decodeJPEGLossless'),
  ]);

  // Wrap initialize functions to handle type mismatches
  registerDecoder('htj2k', () => htj2k.initialize());
  registerDecoder('jpeg2000', () => jpeg2000.initialize());
  registerDecoder('jpegls', () => jpegls.initialize());
  registerDecoder('jpegbaseline8bit', () => jpegbaseline8bit.initialize());
  registerDecoder('jpegbaseline12bit', () => jpegbaseline12bit.initialize());
  registerDecoder('jpeglossless', () => jpeglossless.initialize());
}

let isDecoderMapInitialized = false;

/**
 * Preload specified image decoders or all available decoders
 * @param decoders - Array of decoder names to preload, or true to preload all
 * @param decodeConfig - Optional decode configuration
 * @returns Promise that resolves when all decoders are preloaded
 */
export async function preloadDecoders(
  decoders: DecoderName[] | true = true,
  decodeConfig?: LoaderDecodeOptions
): Promise<void> {
  // Initialize the decoder map if not already done
  if (!isDecoderMapInitialized) {
    await initializeDecoderMap();
    isDecoderMapInitialized = true;
  }

  // Determine which decoders to preload
  const decodersToPreload =
    decoders === true
      ? Array.from(decoderInitializers.keys())
      : decoders.filter((name) => decoderInitializers.has(name));

  // Preload all specified decoders in parallel
  const preloadPromises = decodersToPreload.map((name) => {
    const initializer = decoderInitializers.get(name);
    if (initializer) {
      return initializer(decodeConfig).catch((error) => {
        console.warn(`Failed to preload decoder "${name}":`, error);
        // Don't fail the entire preload operation if one decoder fails
        return Promise.resolve();
      });
    }
    return Promise.resolve();
  });

  await Promise.all(preloadPromises);
}
