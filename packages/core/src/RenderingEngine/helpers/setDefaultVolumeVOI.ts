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
import { ImageQualityStatus, MetadataModules, RequestType } from '../../enums';
import cache from '../../cache/cache';

const PRIORITY = 0;
const REQUEST_TYPE = RequestType.Interaction;

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

  if (
    !voi &&
    imageVolume.imageIds.length &&
    shouldUseImageIdsForVOI(imageVolume)
  ) {
    voi = handlePreScaledVolume(imageVolume, undefined);
    voi ??= handlePreScaledVolume(
      imageVolume,
      await getVOIFromMiddleSliceMinMax(imageVolume)
    );
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
  const imageIds = imageVolume.imageIds;
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageIds[imageIdIndex];

  const generalSeriesModule =
    metaData.get(MetadataModules.GENERAL_SERIES, imageId) || {};

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
    const voiLutModule = metaData.get(MetadataModules.VOI_LUT, imageId);
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

  // A derived volume takes the image of its cache as it is. A streaming
  // volume reads the image that it shows: it reads its frames from the image
  // cache, so the image of a frame that it delivered, or its own pending
  // request for that image, gives the values that it draws. A second request
  // of an image that the volume loads would come after every request of its
  // retrieve stages and hold the mount until the whole volume has loaded.
  // Any other volume loads the image again with the scaling of now.
  let image = cache.getImage(imageId);

  if (!imageVolume.referencedImageIds?.length) {
    image = await getImageOfVolume(imageVolume, imageIdIndex, options);
  }

  // Get the min and max pixel values of the middle slice
  const { min, max } = image.voxelManager.getMinMax();

  // An RGB voxel manager gives an array of one value for each component, and a
  // grayscale voxel manager gives a number. The `length > 1` test is the test
  // that this code applied before, and it keeps an array of one value as it is.
  if (Array.isArray(min) && min.length > 1) {
    return {
      lower: Math.min(...min),
      upper: Math.max(...(max as number[])),
    };
  }

  return {
    lower: min as number,
    upper: max as number,
  };
}

/**
 * The middle image of a volume with data of its own: of a streaming volume
 * (a volume with a load status, which loads its images itself), the image of
 * the cache when the volume delivered that frame, else the image of its
 * pending request; else a new request of the image. A volume without a load
 * status answers every frame as delivered, so it takes the new request.
 */
async function getImageOfVolume(
  imageVolume: IImageVolume,
  imageIdIndex: number,
  options
) {
  const imageId = imageVolume.imageIds[imageIdIndex];
  const streamingVolume = imageVolume as IImageVolume & {
    getImageQuality?: (index: number) => ImageQualityStatus | undefined;
    loadStatus?: { loading?: boolean };
  };
  const delivered =
    Boolean(streamingVolume.loadStatus) &&
    streamingVolume.getImageQuality?.(imageIdIndex) >=
      ImageQualityStatus.SUBRESOLUTION;
  const cachedImage =
    delivered && cache.getImage(imageId, ImageQualityStatus.SUBRESOLUTION);

  if (cachedImage) {
    return cachedImage;
  }

  const pendingImage = streamingVolume.loadStatus?.loading
    ? await cache.getImageLoadObject(imageId)?.promise.catch(() => undefined)
    : undefined;

  if (
    pendingImage &&
    !(pendingImage.imageQualityStatus < ImageQualityStatus.SUBRESOLUTION)
  ) {
    return pendingImage;
  }

  return loadAndCacheImage(imageId, { ...options, ignoreCache: true });
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
