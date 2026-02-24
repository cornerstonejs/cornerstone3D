import { addProvider, typedProviderProvider } from './metaData';
import { registerCacheProviders } from './utilities/metadataProvider/cacheData';
import { registerUriModule } from './utilities/metadataProvider/uriModule';
import { registerDataLookup } from './utilities/metadataProvider/dataLookup';
import { registerInstanceFromListener } from './utilities/metadataProvider/instanceFromListener';
import { registerCombineFrameProvider } from './utilities/metadataProvider/combineFrameInstance';
import { registerTagModules } from './utilities/metadataProvider/tagModules';
import { registerImagePlaneCalibrated } from './utilities/metadataProvider/imagePlaneCalibrated';
import { registerCalibrationModule } from './utilities/metadataProvider/calibrationModule';
import { registerPixelDataUpdate } from './utilities/metadataProvider/pixelDataUpdate';
import { registerTransferSyntaxProvider } from './utilities/metadataProvider/transferSyntaxProvider';

let registered = false;

/**
 * Registers the default/base typed metadata providers.
 *
 * This sets up the typed provider infrastructure including:
 * - The typed provider bridge (makes typed providers available via the general provider chain)
 * - Cache providers for instance, image plane, URI, and frame modules
 * - URI module provider (extracts frame info from imageId URIs)
 * - Data lookup providers (bridge between instance data and specific modules)
 * - Instance-from-listener provider (converts DICOM_SOURCE to INSTANCE_ORIG)
 * - Combine frame provider (handles multiframe instances)
 * - Tag modules (converts instance data to module-specific results)
 * - Image plane calibrated provider
 * - Calibration module provider
 * - Pixel data update provider (palette color handling)
 * - Transfer syntax provider
 *
 * Call this once at application startup before querying metadata.
 * Data source providers (e.g. registerDicomwebProvider)
 * should be registered separately.
 */
export function registerDefaultProvider() {
  if (registered) {
    return;
  }
  registered = true;

  // Register the typed provider bridge at low priority so that
  // legacy providers added via addProvider() run first
  addProvider(typedProviderProvider, -1000);

  // Register cache providers
  registerCacheProviders();

  // Register URI module provider
  registerUriModule();

  // Register data lookup providers
  registerDataLookup();

  // Register instance from DICOM_SOURCE listener
  registerInstanceFromListener();

  // Register combine frame provider
  registerCombineFrameProvider();

  // Register tag modules for all known metadata modules
  registerTagModules();

  // Register image plane calibrated provider
  registerImagePlaneCalibrated();

  // Register calibration module provider
  registerCalibrationModule();

  // Register pixel data update provider
  registerPixelDataUpdate();

  // Register transfer syntax provider
  registerTransferSyntaxProvider();
}
