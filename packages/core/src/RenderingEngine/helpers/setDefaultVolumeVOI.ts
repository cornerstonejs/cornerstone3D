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

  // A prescaled PT volume contains SUV values, but the window in the metadata
  // is in the unscaled counts. Thus this window gives a very large range and a
  // black volume, and a prescaled PT volume must use the default range 0 to 5.
  // This is also correct for a volume that has no imageIds, because the
  // prescaling is a property of the volume, not of the source of the window.
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

  // A volume is not required to have imageIds. A volume that comes from its
  // own metadata has none. Thus get the general series module only when there
  // is an instance. The test for the prescaling reads only fields of the volume.
  const generalSeriesModule =
    (imageId ? metaData.get(MetadataModules.GENERAL_SERIES, imageId) : null) ||
    {};
  // The metadata of the volume gives the modality when the general series
  // module of the instance is absent. Without the modality, the code below does
  // not find a prescaled PT volume.
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
 * Finds a usable Window Center and Window Width. The search starts at the middle
 * of the stack and continues to the two ends.
 *
 * The middle instance is the best slice, but its metadata can be absent. The
 * position of an imageId in the volume depends on the method that made the
 * volume and on the sequence of the instances. When the metadata of the middle
 * instance was absent, the volume found no window. Then it used a range from
 * the minimum and the maximum of the pixel data. Usually,
 * the other instances of the series have the same window. Thus the nearest
 * instance that has a window gives a much better result.
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

    // A center of 0 is a correct window. Prescaled PT volumes, parametric maps
    // and centered MR volumes use one. Thus make sure that the center exists,
    // but do not make sure that the center is not 0. If not, these series use a
    // range from the minimum and the maximum. But a width of 0, or an absent
    // width, gives no window.
    if (!width || center == null) {
      continue;
    }

    // Keep the VOI LUT Function with the window. The function controls how the
    // window becomes a range. If the function is lost, a volume with the
    // function LINEAR_EXACT or SIGMOID gets a LINEAR window.
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
    // A volume that has no imageIds contains its own window, but the volume is
    // not required to have one.
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
