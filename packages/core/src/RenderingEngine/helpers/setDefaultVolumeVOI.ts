import type {
  ImageActor,
  VolumeActor,
  IImageVolume,
  VOIRange,
  ScalingParameters,
} from '../../types';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { loadAndCacheImage } from '../../loaders/imageLoader';
import * as metaData from '../../metaData';
import * as windowLevel from '../../utilities/windowLevel';
import { normalizeVOILUTFunction } from '../../utilities/voiLUTFunction';
import { MetadataModules, RequestType } from '../../enums';
import cache from '../../cache/cache';

const PRIORITY = 0;
const REQUEST_TYPE = RequestType.Prefetch;

/**
 * It sets the default window level of an image volume based on the VOI.
 * It first look for the VOI in the metadata and if it is not found, it
 * loads the middle slice image (middle imageId) and based on its min
 * and max pixel values, it calculates the VOI.
 * Finally it sets the VOI on the volumeActor transferFunction
 * @param volumeActor - The volume actor
 * @param imageVolume - The image volume that we want to set the VOI for.
 */
async function setDefaultVolumeVOI(
  volumeActor: VolumeActor | ImageActor,
  imageVolume: IImageVolume
): Promise<void> {
  const voi = await getDefaultVolumeVOIRange(imageVolume);

  if (
    !voi ||
    (voi.lower === 0 && voi.upper === 0) ||
    voi.lower === undefined ||
    voi.upper === undefined
  ) {
    return;
  }

  ensureRGBTransferFunction(volumeActor).setMappingRange(voi.lower, voi.upper);
}

function ensureRGBTransferFunction(volumeActor: VolumeActor | ImageActor) {
  const property = volumeActor.getProperty();
  let transferFunction = property.getRGBTransferFunction(0);

  if (transferFunction) {
    return transferFunction;
  }

  transferFunction = vtkColorTransferFunction.newInstance();
  transferFunction.addRGBPoint(0, 0, 0, 0);
  transferFunction.addRGBPoint(1, 1, 1, 1);
  property.setRGBTransferFunction(0, transferFunction);

  if ('setUseLookupTableScalarRange' in property) {
    property.setUseLookupTableScalarRange?.(true);
  }

  return transferFunction;
}

export async function getDefaultVolumeVOIRange(
  imageVolume: IImageVolume
): Promise<VOIRange | undefined> {
  let voi = getVOIFromMetadata(imageVolume);

  // A prescaled PT gets the 0-5 default even when the metadata does carry a
  // window. PT window width/center is expressed in the unscaled counts, so
  // applying it to SUV values produces an enormous range and a black volume.
  // This override used to run only on the min/max path below, so a PT series
  // that shipped a window skipped it and the volume viewport disagreed with the
  // stack viewport, which has always preferred its own PT range. It applies to
  // a volume with no imageIds too, whose window came from the volume metadata
  // rather than from an instance: scaling is a property of the volume, not of
  // how its window was found.
  if (voi) {
    voi = handlePreScaledVolume(imageVolume, voi);
  }

  if (
    !voi &&
    imageVolume.imageIds?.length &&
    shouldUseImageIdsForVOI(imageVolume)
  ) {
    voi = await getVOIFromMiddleSliceMinMax(imageVolume);
    voi = handlePreScaledVolume(imageVolume, voi);
  }

  return voi;
}

function shouldUseImageIdsForVOI(imageVolume: IImageVolume): boolean {
  const { imageIds, referencedImageIds } = imageVolume;

  if (referencedImageIds?.length) {
    return true;
  }

  const imageId = imageIds[Math.floor(imageIds.length / 2)];

  // Derived images are cache-only image objects created from another source.
  // Generated geometry/labelmap image IDs can also be cache-only and may not
  // have an image loader scheme at all; those should not drive default VOI.
  if (!imageId || imageId.startsWith('derived:')) {
    return false;
  }

  return imageId.includes(':');
}

function handlePreScaledVolume(imageVolume: IImageVolume, voi: VOIRange) {
  const imageIds = imageVolume.imageIds ?? [];
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageIds[imageIdIndex];

  // A volume does not have to carry imageIds - one built from its own metadata
  // has none - so the general series module is only worth asking for when there
  // is an instance to key it on. The volume metadata fallback below covers the
  // rest, and the prescaling check itself reads only volume level fields.
  const generalSeriesModule =
    (imageId ? metaData.get(MetadataModules.GENERAL_SERIES, imageId) : null) ||
    {};
  // The volume's own metadata is the fallback: the middle instance may not have
  // a registered general series module, and missing the modality here would
  // quietly skip the PT handling below.
  const modality =
    generalSeriesModule.modality ?? imageVolume.metadata?.Modality;

  /**
   * If the volume is prescaled and the modality is PT Sometimes you get super high
   * values at the peak and it skews the min/max so nothing useful is displayed
   * Therefore, we follow the majority of other viewers and we set the min/max
   * for the scaled PT to be 0, 5
   */
  if (_isCurrentImagePTPrescaled(modality, imageVolume)) {
    return {
      lower: 0,
      upper: 5,
    };
  }

  return voi;
}

/**
 * Finds a usable Window Center/Width, starting at the middle of the stack and
 * walking outwards.
 *
 * The middle instance is preferred (it is the most representative slice), but it
 * is not guaranteed to have registered metadata: which imageId lands in the
 * middle depends on how the volume was created and in which order its instances
 * were added, and an instance whose metadata has not been registered yet
 * silently produced no window at all - the volume then fell back to a min/max
 * range from the pixel data (cornerstone3D#1767). Any sibling in the same series
 * carries the same window in practice, so the nearest instance that has one is a
 * far better answer than giving up.
 */
function getWindowFromNearestImageId(imageIds: string[]) {
  const middle = Math.floor(imageIds.length / 2);

  for (let offset = 0; offset < imageIds.length; offset++) {
    // middle, middle + 1, middle - 1, middle + 2, ...
    const direction = offset % 2 === 0 ? 1 : -1;
    const index = middle + direction * Math.ceil(offset / 2);

    if (index < 0 || index >= imageIds.length) {
      continue;
    }

    const voiLutModule = metaData.get(MetadataModules.VOI_LUT, imageIds[index]);

    const { windowWidth, windowCenter } = voiLutModule ?? {};
    const width = Array.isArray(windowWidth) ? windowWidth[0] : windowWidth;
    const center = Array.isArray(windowCenter) ? windowCenter[0] : windowCenter;

    // A center of 0 is a perfectly good window - prescaled PT, parametric maps
    // and centered MR all use one - so it has to be tested for existence rather
    // than for truthiness, or those series silently fall back to a min/max
    // range. A width of 0 or a missing width has no window to show, however.
    if (!width || center == null) {
      continue;
    }

    // The VOI LUT Function has to stay attached to the window - it decides how
    // the window converts to a range. It used to be assigned to `voi` first and
    // then overwritten by the window object, so a LINEAR_EXACT/SIGMOID volume
    // was silently windowed as LINEAR.
    return {
      windowWidth: width,
      windowCenter: center,
      voiLUTFunction: normalizeVOILUTFunction(voiLutModule.voiLUTFunction),
    };
  }

  return undefined;
}

/**
 * Get the VOI from the metadata of the middle slice of the image volume or the metadata of the image volume
 * It checks the metadata for the VOI and if it is not found, it returns null
 *
 * @param imageVolume - The image volume that we want to get the VOI from.
 * @returns VOIRange with lower and upper values
 */
function getVOIFromMetadata(imageVolume: IImageVolume): VOIRange | undefined {
  const { imageIds, metadata } = imageVolume;
  let voi;
  if (imageIds?.length) {
    voi = getWindowFromNearestImageId(imageIds);
  } else {
    // A volume without imageIds carries its own window, which it is not
    // required to have - indexing it unconditionally threw for every volume
    // built without one
    voi = metadata?.voiLut?.[0];
  }

  if (voi && (voi.windowWidth !== 0 || voi.windowCenter !== 0)) {
    const { lower, upper } = windowLevel.toLowHighRange(
      Number(voi.windowWidth),
      Number(voi.windowCenter),
      voi.voiLUTFunction
    );

    if (isNaN(lower) || isNaN(upper)) {
      return;
    }

    return { lower, upper };
  }

  // Return undefined if no valid VOI was found
  return undefined;
}

/**
 * It loads the middle slice image (middle imageId) and based on its min
 * and max pixel values, it calculates the VOI.
 *
 * @param imageVolume - The image volume that we want to get the VOI from.
 * @returns The VOIRange with lower and upper values
 */
async function getVOIFromMiddleSliceMinMax(
  imageVolume: IImageVolume
): Promise<VOIRange> {
  const { imageIds } = imageVolume;

  // Get the middle image from the list of imageIds
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageVolume.imageIds[imageIdIndex];
  const generalSeriesModule =
    metaData.get(MetadataModules.GENERAL_SERIES, imageId) || {};
  const { modality } = generalSeriesModule;
  const modalityLutModule =
    metaData.get(MetadataModules.MODALITY_LUT, imageId) || {};

  const scalingParameters: ScalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope,
    rescaleIntercept: modalityLutModule.rescaleIntercept,
    modality,
  };

  let scalingParametersToUse;
  if (modality === 'PT') {
    const suvFactor = metaData.get(MetadataModules.SCALING, imageId);

    if (suvFactor) {
      scalingParametersToUse = {
        ...scalingParameters,
        suvbw: suvFactor.suvbw,
      };
    }
  }

  const options = {
    priority: PRIORITY,
    requestType: REQUEST_TYPE,
    preScale: {
      scalingParameters: scalingParametersToUse,
    },
  };

  // Loading the middle slice image for a volume has two scenarios, the first one is that
  // uses the same volumeLoader which might not resolve to an image (since for performance
  // reasons volumes' pixelData is set via offset and length on the volume arrayBuffer
  // when each slice is loaded). The second scenario is that the image might not reach
  // to the volumeLoader, and an already cached image (with Image object) is used
  // instead. For the first scenario, we use the arrayBuffer of the volume to get the correct
  // slice for the imageScalarData, and for the second scenario we use the getPixelData
  // on the Cornerstone IImage object to get the pixel data.
  // Note: we don't want to use the derived or generated images for setting the
  // default VOI, because they are not the original. This is ugly but don't
  // know how to do it better.
  let image = cache.getImage(imageId);

  if (!imageVolume.referencedImageIds?.length) {
    // we should ignore the cache here,
    // since we want to load the image from with the most
    // recent preScale settings
    image = await loadAndCacheImage(imageId, { ...options, ignoreCache: true });
  }

  // Get the min and max pixel values of the middle slice
  let { min, max } = image.voxelManager.getMinMax();

  if (min?.length > 1) {
    min = Math.min(...min);
    max = Math.max(...max);
  }

  return {
    lower: min,
    upper: max,
  };
}

function _isCurrentImagePTPrescaled(modality, imageVolume) {
  if (modality !== 'PT' || !imageVolume.isPreScaled) {
    return false;
  }

  if (!imageVolume.scaling?.PT?.suvbw) {
    return false;
  }

  return true;
}

export default setDefaultVolumeVOI;
