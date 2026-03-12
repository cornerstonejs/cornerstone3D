import { addProvider, typedProviderProvider } from './metaData';
import calibratedPixelSpacingMetadataProvider from './utilities/calibratedPixelSpacingMetadataProvider';
import { registerCacheProviders } from './utilities/metadataProvider/cacheData';
import { registerUriModule } from './utilities/metadataProvider/uriModule';
import { registerDataLookup } from './utilities/metadataProvider/dataLookup';
import { registerInstanceFromListener } from './utilities/metadataProvider/instanceFromListener';
import { registerCombineFrameProvider } from './utilities/metadataProvider/combineFrameInstance';
import {
  clearTagModules,
  registerTagModules,
} from './utilities/metadataProvider/tagModules';
import { registerImagePlaneCalibrated } from './utilities/metadataProvider/imagePlaneCalibrated';
import { registerCalibrationModule } from './utilities/metadataProvider/calibrationModule';
import { registerPixelDataUpdate } from './utilities/metadataProvider/pixelDataUpdate';
import { registerTransferSyntaxProvider } from './utilities/metadataProvider/transferSyntaxProvider';
import { registerEcgFromInstanceProvider } from './utilities/metadataProvider/ecgFromInstance';
import { registerCompressedFrameDataProvider } from './utilities/metadataProvider/compressedFrameData';
import { registerNaturalBaseImageIdFallback } from './utilities/metadataProvider/naturalBaseImageIdFallback';
import { registerScalingFromInstanceProvider } from './utilities/metadataProvider/scalingFromInstance';

const TYPED_PROVIDER_BRIDGE_PRIORITY = -1000;

/**
 * Registers the default/base typed metadata providers.
 *
 * This sets up the typed provider infrastructure including:
 * - The typed provider bridge (makes typed providers available via the general provider chain)
 * - Cache providers for instance, image plane, URI, and frame modules
 * - URI module provider (extracts frame info from imageId URIs)
 * - Data lookup providers (bridge between instance data and specific modules)
 * - Instance provider (bridges INSTANCE to NATURAL)
 * - Combine frame provider (handles multiframe instances)
 * - Tag modules (converts instance data to module-specific results)
 * - Image plane calibrated provider
 * - Calibration module provider
 * - Pixel data update provider (palette color handling)
 * - Transfer syntax provider
 *
 * Call at start or after removeAllProviders() to re-establish typed providers; duplicates are skipped.
 */
export function registerDefaultProvider() {
  // Register the typed provider bridge at low priority so that
  // legacy providers added via addProvider() run first
  addProvider(typedProviderProvider, TYPED_PROVIDER_BRIDGE_PRIORITY);

  // Register calibrated pixel spacing so metaData.get('calibratedPixelSpacing', imageId) resolves
  addProvider(calibratedPixelSpacingMetadataProvider.get);

  // Clear tag modules cache so registerTagModules() gets fresh providers
  // (after removeAllProviders the typed map is cleared but tagModules' map isn't)
  clearTagModules();

  // Register cache providers
  registerCacheProviders();

  // When NATURAL is queried with imageId that has ?frame=, resolve from base imageId
  registerNaturalBaseImageIdFallback();

  // Register URI module provider
  registerUriModule();

  // Register data lookup providers
  registerDataLookup();

  // Register INSTANCE → NATURAL bridge
  registerInstanceFromListener();

  // Register combine frame provider
  registerCombineFrameProvider();

  // Register tag modules for all known metadata modules
  registerTagModules();

  // Full ECG module from instance (waveformData.retrieveBulkData) for ECGViewport
  registerEcgFromInstanceProvider();

  // Register image plane calibrated provider
  registerImagePlaneCalibrated();

  // Register calibration module provider
  registerCalibrationModule();

  // Register pixel data update provider
  registerPixelDataUpdate();

  // Register transfer syntax provider
  registerTransferSyntaxProvider();

  // Compressed frame data (pixel data from NATURAL) via getMetaData('compressedFrameData', imageId, { frameIndex })
  registerCompressedFrameDataProvider();

  // scalingModule from instance (PT: SUV factors; RTDOSE: DoseGridScaling etc.)
  registerScalingFromInstanceProvider();
}
