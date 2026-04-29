import { addProvider, metadataModuleProvider } from './metaData';
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
import { registerScalingFromInstanceProvider } from './utilities/metadataProvider/scalingFromInstance';
import { registerNaturalizedHandlers } from './utilities/metadataProvider/naturalizedHandlers';
import { registerImageIdProviders } from './utilities/metadataProvider/imageIdsProviders';

const TYPED_PROVIDER_BRIDGE_PRIORITY = -1000;

/**
 * Registers the default/base typed metadata providers.
 *
 * This sets up the typed provider infrastructure including:
 * - The typed provider bridge (makes typed providers available via the general provider chain)
 * - Cache providers for instance, image plane, URI, and frame modules
 * - URI module provider (extracts frame info from imageId URIs)
 * - Data lookup providers (bridge between instance data and specific modules)
 * - Instance provider (bridges INSTANCE to NATURALIZED)
 * - Combine frame provider (handles multiframe instances)
 * - Tag modules (converts instance data to module-specific results)
 * - Image plane calibrated provider
 * - Calibration module provider
 * - Pixel data update provider (palette color handling)
 * - Transfer syntax provider
 *
 * Call at start or after removeAllProviders() to re-establish typed providers; duplicates are skipped.
 */
export function registerDefaultProviders() {
  // Register the typed provider bridge at low priority so that
  // legacy providers added via addProvider() run first
  addProvider(metadataModuleProvider, TYPED_PROVIDER_BRIDGE_PRIORITY);

  // Register calibrated pixel spacing so metaData.get('calibratedPixelSpacing', imageId) resolves
  addProvider(calibratedPixelSpacingMetadataProvider.get);

  // Clear tag modules cache so registerTagModules() gets fresh providers
  // (after removeAllProviders the typed map is cleared but tagModules' map isn't)
  clearTagModules();

  // Register cache providers
  registerCacheProviders();

  // Register options-driven naturalized handlers (sync metadata and async part10)
  registerNaturalizedHandlers();

  // Register URI module provider
  registerUriModule();

  // Register imageId provider pipeline with front-end cache
  registerImageIdProviders();

  // Register data lookup providers
  registerDataLookup();

  // Register INSTANCE -> NATURALIZED bridge
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

  // Compressed frame data (pixel data from NATURALIZED) via getMetaData('compressedFrameData', imageId, { frameIndex })
  registerCompressedFrameDataProvider();

  // scalingModule from instance (PT: SUV factors; RTDOSE: DoseGridScaling etc.)
  registerScalingFromInstanceProvider();
}
