import type {
  VolumeActor,
  IImageVolume,
  VOIRange,
  ScalingParameters,
} from '../../types';
import { loadAndCacheImage } from '../../loaders/imageLoader';
import * as metaData from '../../metaData';
import * as windowLevel from '../../utilities/windowLevel';
import { RequestType } from '../../enums';
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
  volumeActor: VolumeActor,
  imageVolume: IImageVolume
): Promise<void> {
  let voi = getVOIFromMetadata(imageVolume);

  if (!voi && imageVolume.imageIds.length) {
    voi = await getVOIFromMiddleSliceMinMax(imageVolume);
    voi = handlePreScaledVolume(imageVolume, voi);
  }

  if (
    (voi.lower === 0 && voi.upper === 0) ||
    voi.lower === undefined ||
    voi.upper === undefined
  ) {
    return;
  }

  volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setMappingRange(voi.lower, voi.upper);
}

function handlePreScaledVolume(imageVolume: IImageVolume, voi: VOIRange) {
  const imageIds = imageVolume.imageIds;
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageIds[imageIdIndex];

  const generalSeriesModule =
    metaData.get('generalSeriesModule', imageId) || {};

  /**
   * If the volume is prescaled and the modality is PT Sometimes you get super high
   * values at the peak and it skews the min/max so nothing useful is displayed
   * Therefore, we follow the majority of other viewers and we set the min/max
   * for the scaled PT to be 0, 5
   */
  if (_isCurrentImagePTPrescaled(generalSeriesModule.modality, imageVolume)) {
    return {
      lower: 0,
      upper: 5,
    };
  }

  return voi;
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
    const imageIdIndex = Math.floor(imageIds.length / 2);
    const imageId = imageIds[imageIdIndex];
    const voiLutModule = metaData.get('voiLutModule', imageId);
    if (voiLutModule && voiLutModule.windowWidth && voiLutModule.windowCenter) {
      if (voiLutModule?.voiLUTFunction) {
        voi = {};
        voi.voiLUTFunction = voiLutModule?.voiLUTFunction;
      }
      const { windowWidth, windowCenter } = voiLutModule;
      const width = Array.isArray(windowWidth) ? windowWidth[0] : windowWidth;
      const center = Array.isArray(windowCenter)
        ? windowCenter[0]
        : windowCenter;

      // Skip if width is 0
      if (width !== 0) {
        voi = { windowWidth: width, windowCenter: center };
      }
    }
  } else {
    voi = metadata.voiLut[0];
  }

  if (voi && (voi.windowWidth !== 0 || voi.windowCenter !== 0)) {
    const { lower, upper } = windowLevel.toLowHighRange(
      Number(voi.windowWidth),
      Number(voi.windowCenter),
      voi.voiLUTFunction
    );
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
    metaData.get('generalSeriesModule', imageId) || {};
  const { modality } = generalSeriesModule;
  const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

  const scalingParameters: ScalingParameters = {
    rescaleSlope: modalityLutModule.rescaleSlope,
    rescaleIntercept: modalityLutModule.rescaleIntercept,
    modality,
  };

  let scalingParametersToUse;
  if (modality === 'PT') {
    const suvFactor = metaData.get('scalingModule', imageId);

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

  if (!imageVolume.scaling?.PT.suvbw) {
    return false;
  }

  return true;
}

export default setDefaultVolumeVOI;
