import {
  VolumeActor,
  IImageVolume,
  VOIRange,
  ScalingParameters,
} from '../../types';
import { loadAndCacheImage } from '../../loaders/imageLoader';
import * as metaData from '../../metaData';
import { getMinMax, windowLevel } from '../../utilities';
import { RequestType } from '../../enums';

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

  if (!voi) {
    voi = await getVOIFromMinMax(imageVolume);
  }

  if (!voi || voi.lower === undefined || voi.upper === undefined) {
    throw new Error(
      'Could not get VOI from metadata, nor from the min max of the image middle slice'
    );
  }

  voi = handlePreScaledVolume(imageVolume, voi);
  const { lower, upper } = voi;

  volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setMappingRange(lower, upper);
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
  if (generalSeriesModule.modality === 'PT' && imageVolume.isPrescaled) {
    return {
      lower: 0,
      upper: 5,
    };
  }

  return voi;
}

/**
 * Get the VOI from the metadata of the middle slice of the image volume. It checks
 * the metadata for the VOI and if it is not found, it returns null
 *
 * @param imageVolume - The image volume that we want to get the VOI from.
 * @returns VOIRange with lower and upper values
 */
function getVOIFromMetadata(imageVolume: IImageVolume): VOIRange {
  const { imageIds } = imageVolume;

  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageIds[imageIdIndex];

  const voiLutModule = metaData.get('voiLutModule', imageId);

  if (voiLutModule && voiLutModule.windowWidth && voiLutModule.windowCenter) {
    const { windowWidth, windowCenter } = voiLutModule;

    const voi = {
      windowWidth: Array.isArray(windowWidth) ? windowWidth[0] : windowWidth,
      windowCenter: Array.isArray(windowCenter)
        ? windowCenter[0]
        : windowCenter,
    };

    const { lower, upper } = windowLevel.toLowHighRange(
      Number(voi.windowWidth),
      Number(voi.windowCenter)
    );

    return {
      lower,
      upper,
    };
  }
}

/**
 * It loads the middle slice image (middle imageId) and based on its min
 * and max pixel values, it calculates the VOI.
 *
 * @param imageVolume - The image volume that we want to get the VOI from.
 * @returns The VOIRange with lower and upper values
 */
async function getVOIFromMinMax(imageVolume: IImageVolume): Promise<VOIRange> {
  const { scalarData, imageIds } = imageVolume;

  // Get the middle image from the list of imageIds
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageVolume.imageIds[imageIdIndex];
  const generalSeriesModule =
    metaData.get('generalSeriesModule', imageId) || {};
  const { modality } = generalSeriesModule;
  const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

  const numImages = imageIds.length;
  const bytesPerImage = scalarData.byteLength / numImages;
  const voxelsPerImage = scalarData.length / numImages;
  const bytePerPixel = scalarData.BYTES_PER_ELEMENT;

  let type;

  if (scalarData instanceof Uint8Array) {
    type = 'Uint8Array';
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array';
  } else {
    throw new Error('Unsupported array type');
  }

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

  const byteOffset = imageIdIndex * bytesPerImage;

  const options = {
    targetBuffer: {
      arrayBuffer: scalarData.buffer,
      offset: byteOffset,
      length: voxelsPerImage,
      type,
    },
    priority: PRIORITY,
    requestType: REQUEST_TYPE,
    preScale: {
      enabled: true,
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
  const image = await loadAndCacheImage(imageId, options);

  let imageScalarData;
  if (!image) {
    imageScalarData = _getImageScalarDataFromImageVolume(
      imageVolume,
      byteOffset,
      bytePerPixel,
      voxelsPerImage
    );
  } else {
    imageScalarData = image.getPixelData();
  }

  // Get the min and max pixel values of the middle slice
  const { min, max } = getMinMax(imageScalarData);

  return {
    lower: min,
    upper: max,
  };
}

function _getImageScalarDataFromImageVolume(
  imageVolume,
  byteOffset,
  bytePerPixel,
  voxelsPerImage
) {
  const { scalarData } = imageVolume;
  const { volumeBuffer } = scalarData;
  if (scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
    byteOffset *= scalarData.BYTES_PER_ELEMENT / bytePerPixel;
  }

  const TypedArray = scalarData.constructor;
  const imageScalarData = new TypedArray(voxelsPerImage);

  const volumeBufferView = new TypedArray(
    volumeBuffer,
    byteOffset,
    voxelsPerImage
  );

  imageScalarData.set(volumeBufferView);

  return imageScalarData;
}

export default setDefaultVolumeVOI;
