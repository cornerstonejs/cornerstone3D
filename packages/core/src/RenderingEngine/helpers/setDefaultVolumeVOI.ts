import type {
  ImageActor,
  VolumeActor,
  IImageVolume,
  VOIRange,
  ScalingParameters,
  CPUFallbackLUT,
} from '../../types';
import type vtkColorTransferFunctionType from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { loadAndCacheImage } from '../../loaders/imageLoader';
import * as metaData from '../../metaData';
import * as windowLevel from '../../utilities/windowLevel';
import { normalizeVOILUTFunction } from '../../utilities/voiLUTFunction';
import createVOILUTSequenceTransferFunction, {
  getVOILUTSequenceRange,
  isRenderableVOILUT,
} from '../../utilities/createVOILUTSequenceTransferFunction';
import createSigmoidRGBTransferFunction from '../../utilities/createSigmoidRGBTransferFunction';
import { MetadataModules, RequestType, VOILUTFunctionType } from '../../enums';
import cache from '../../cache/cache';

const PRIORITY = 0;
const REQUEST_TYPE = RequestType.Prefetch;

// A prescaled PT volume holds SUV values, and a SUV of 0 to 5 is the range that
// the majority of the viewers use. See _isCurrentImagePTPrescaled.
const PT_PRESCALED_RANGE: VOIRange = { lower: 0, upper: 5 };

/**
 * The shape of the VOI transformation that the file of a volume specifies: the
 * VOI LUT Function (0028,1056) and the VOI LUT Sequence (0028,3010). The range
 * alone cannot carry either one - a sigmoid and a curve of a sequence need
 * their own transfer function.
 */
export type VolumeVOIShape = {
  voiLUTFunction?: VOILUTFunctionType;
  voiLUT?: CPUFallbackLUT;
};

/** The full default VOI of a volume: the range plus its shape. */
export type VolumeVOI = VolumeVOIShape & { voiRange?: VOIRange };

/**
 * What one instance of a volume says about the VOI. Either a window, or a VOI
 * LUT Sequence, together with the VOI LUT Function of that instance.
 */
type VolumeVOISource = VolumeVOIShape & {
  windowWidth?: number;
  windowCenter?: number;
};

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
  const voi = await getDefaultVolumeVOI(imageVolume);

  applyVolumeVOI(volumeActor, voi);
}

/**
 * Puts a default VOI on an actor. A VOI LUT Sequence and the SIGMOID function
 * need a new transfer function, because a range cannot give a curve. Each other
 * function keeps the transfer function of the actor and moves its range. Thus a
 * colormap on that transfer function stays.
 */
function applyVolumeVOI(
  volumeActor: VolumeActor | ImageActor,
  voi: VolumeVOI
): void {
  const { voiRange } = voi;

  if (!isUsableVOIRange(voiRange)) {
    return;
  }

  const curve = createVolumeVOITransferFunction(voi);

  if (curve) {
    installTransferFunction(volumeActor, curve);

    return;
  }

  ensureRGBTransferFunction(volumeActor).setMappingRange(
    voiRange.lower,
    voiRange.upper
  );
}

/**
 * The transfer function that the shape of a VOI needs, or undefined when a
 * range on the existing transfer function is enough (the LINEAR and the
 * LINEAR_EXACT functions, whose difference is already in the range).
 *
 * A VOI LUT Sequence is the whole VOI transformation. Thus it replaces the
 * window and the VOI LUT Function (PS3.3 C.11.2.1). The curve is stretched over
 * the range. Thus window level reshapes the curve and does not replace it. The
 * stack viewport and the generic viewports use the same rule.
 */
export function createVolumeVOITransferFunction(
  voi: VolumeVOI
): vtkColorTransferFunctionType | undefined {
  const { voiRange, voiLUT, voiLUTFunction } = voi;

  if (!isUsableVOIRange(voiRange)) {
    return undefined;
  }

  if (isRenderableVOILUT(voiLUT)) {
    return createVOILUTSequenceTransferFunction(voiLUT, { voiRange });
  }

  if (isSigmoid(voiLUTFunction)) {
    return createSigmoidRGBTransferFunction(voiRange);
  }

  return undefined;
}

/**
 * True when a VOI needs its own transfer function, and false when a range on
 * the existing one gives the same display.
 */
export function volumeVOIIsCurve(voi: VolumeVOIShape): boolean {
  return isRenderableVOILUT(voi.voiLUT) || isSigmoid(voi.voiLUTFunction);
}

function isSigmoid(voiLUTFunction?: VOILUTFunctionType): boolean {
  return (
    normalizeVOILUTFunction(voiLUTFunction) ===
    VOILUTFunctionType.SAMPLED_SIGMOID
  );
}

function isUsableVOIRange(voiRange?: VOIRange): boolean {
  if (!voiRange) {
    return false;
  }

  const { lower, upper } = voiRange;

  if (lower === undefined || upper === undefined) {
    return false;
  }

  return lower !== 0 || upper !== 0;
}

function installTransferFunction(
  volumeActor: VolumeActor | ImageActor,
  transferFunction: vtkColorTransferFunctionType
) {
  const property = volumeActor.getProperty();

  property.setRGBTransferFunction(0, transferFunction);

  if ('setUseLookupTableScalarRange' in property) {
    property.setUseLookupTableScalarRange?.(true);
  }
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

/**
 * The default VOI of a volume: the range, the VOI LUT Function and the VOI LUT
 * Sequence. The range comes from the file, or from the minimum and the maximum
 * of the middle slice when the file gives no VOI.
 */
export async function getDefaultVolumeVOI(
  imageVolume: IImageVolume
): Promise<VolumeVOI> {
  // A prescaled PT volume contains SUV values, but the window and the curve in
  // the metadata are in the unscaled counts. Thus neither applies to it, and it
  // uses the default range 0 to 5. This is also correct for a volume that has
  // no imageIds, because the prescaling is a property of the volume, not of the
  // source of the window.
  if (isPTPrescaledVolume(imageVolume)) {
    return { voiRange: PT_PRESCALED_RANGE };
  }

  const source = getVolumeVOISource(imageVolume);
  let voiRange = getRangeFromVOISource(source);

  if (
    !voiRange &&
    imageVolume.imageIds?.length &&
    shouldUseImageIdsForVOI(imageVolume)
  ) {
    voiRange = await getVOIFromMiddleSliceMinMax(imageVolume);
  }

  return {
    voiRange,
    voiLUT: source?.voiLUT,
    voiLUTFunction: source?.voiLUTFunction,
  };
}

export async function getDefaultVolumeVOIRange(
  imageVolume: IImageVolume
): Promise<VOIRange | undefined> {
  const { voiRange } = await getDefaultVolumeVOI(imageVolume);

  return voiRange;
}

/**
 * The shape of the VOI of a volume, without the load of an instance that the
 * range fallback needs. A viewport calls this on every window level change, so
 * it stays synchronous and reads the metadata only.
 */
export function getVolumeVOIShape(imageVolume: IImageVolume): VolumeVOIShape {
  if (!imageVolume || isPTPrescaledVolume(imageVolume)) {
    return {};
  }

  const source = getVolumeVOISource(imageVolume);

  if (!source) {
    return {};
  }

  return { voiLUT: source.voiLUT, voiLUTFunction: source.voiLUTFunction };
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

function isPTPrescaledVolume(imageVolume: IImageVolume): boolean {
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

  return _isCurrentImagePTPrescaled(modality, imageVolume);
}

/**
 * The VOI LUT Sequence of an instance, in the shape that the renderers use.
 *
 * A cached image is the best source: the loader normalizes the sequence of the
 * file there, and each provider (wadouri, naturalized dcmjs, DICOMweb JSON)
 * gives another shape. The metadata module is the fallback for a volume whose
 * instances were never loaded as images; it holds the already parsed shape on
 * the wadouri path.
 */
function getVOILUTSequenceForImageId(
  imageId: string,
  voiLutModule: Record<string, unknown>
): CPUFallbackLUT | undefined {
  const imageVOILUT = cache.getImage(imageId)?.voiLUT;

  if (isRenderableVOILUT(imageVOILUT)) {
    return imageVOILUT;
  }

  const sequence = voiLutModule.voiLUTSequence;

  if (!sequence) {
    return undefined;
  }

  const items = Array.isArray(sequence) ? sequence : [sequence];

  return items.find(isRenderableVOILUT);
}

/**
 * What one instance says about the VOI, or undefined when it says nothing.
 */
function getVOISourceFromImageId(imageId: string): VolumeVOISource | undefined {
  const voiLutModule = metaData.get(MetadataModules.VOI_LUT, imageId) ?? {};
  const voiLUTFunction = normalizeVOILUTFunction(voiLutModule.voiLUTFunction);
  const voiLUT = getVOILUTSequenceForImageId(imageId, voiLutModule);

  // The sequence is the whole VOI transformation. Thus it wins over a window
  // that the same instance also carries (C.11.2.1), as on the stack viewport.
  if (voiLUT) {
    return { voiLUT, voiLUTFunction };
  }

  const { windowWidth, windowCenter } = voiLutModule;
  const width = Array.isArray(windowWidth) ? windowWidth[0] : windowWidth;
  const center = Array.isArray(windowCenter) ? windowCenter[0] : windowCenter;

  // A center of 0 is a correct window. Prescaled PT volumes, parametric maps
  // and centered MR volumes use one. Thus make sure that the center exists,
  // but do not make sure that the center is not 0. If not, these series use a
  // range from the minimum and the maximum. But a width of 0, or an absent
  // width, gives no window.
  if (!width || center == null) {
    return undefined;
  }

  // Keep the VOI LUT Function with the window. The function controls how the
  // window becomes a range. If the function is lost, a volume with the
  // function LINEAR_EXACT or SIGMOID gets a LINEAR window.
  return { windowWidth: width, windowCenter: center, voiLUTFunction };
}

/**
 * Finds a usable VOI. The search starts at the middle of the stack and
 * continues to the two ends.
 *
 * The middle instance is the best slice, but its metadata can be absent. The
 * position of an imageId in the volume depends on the method that made the
 * volume and on the sequence of the instances. When the metadata of the middle
 * instance was absent, the volume found no window. Then it used a range from
 * the minimum and the maximum of the pixel data. Usually,
 * the other instances of the series have the same window. Thus the nearest
 * instance that has a window gives a much better result.
 */
function getVOISourceFromImageIds(
  imageIds: string[]
): VolumeVOISource | undefined {
  const middle = Math.floor(imageIds.length / 2);

  for (let offset = 0; offset < imageIds.length; offset++) {
    // middle, middle + 1, middle - 1, middle + 2, ...
    const direction = offset % 2 === 0 ? 1 : -1;
    const index = middle + direction * Math.ceil(offset / 2);

    if (index < 0 || index >= imageIds.length) {
      continue;
    }

    const source = getVOISourceFromImageId(imageIds[index]);

    if (source) {
      return source;
    }
  }

  return undefined;
}

/**
 * A volume that has no imageIds contains its own window, but the volume is not
 * required to have one.
 */
function getVOISourceFromVolumeMetadata(
  imageVolume: IImageVolume
): VolumeVOISource | undefined {
  const voi = imageVolume.metadata?.voiLut?.[0];

  if (!voi) {
    return undefined;
  }

  return {
    windowWidth: Number(voi.windowWidth),
    windowCenter: Number(voi.windowCenter),
    voiLUTFunction: normalizeVOILUTFunction(voi.voiLUTFunction),
  };
}

function getVolumeVOISource(
  imageVolume: IImageVolume
): VolumeVOISource | undefined {
  const { imageIds } = imageVolume;

  if (imageIds?.length) {
    return getVOISourceFromImageIds(imageIds);
  }

  return getVOISourceFromVolumeMetadata(imageVolume);
}

/**
 * The range of a VOI source. A VOI LUT Sequence gives its own input domain,
 * because the curve is defined against the output of the modality LUT and not
 * relative to a window. A window becomes a range through its VOI LUT Function.
 */
function getRangeFromVOISource(
  source: VolumeVOISource | undefined
): VOIRange | undefined {
  if (!source) {
    return undefined;
  }

  if (isRenderableVOILUT(source.voiLUT)) {
    return getVOILUTSequenceRange(source.voiLUT);
  }

  const { windowWidth, windowCenter, voiLUTFunction } = source;

  if (windowWidth == null || windowCenter == null) {
    return undefined;
  }

  if (windowWidth === 0 && windowCenter === 0) {
    return undefined;
  }

  const { lower, upper } = windowLevel.toLowHighRange(
    Number(windowWidth),
    Number(windowCenter),
    voiLUTFunction
  );

  if (isNaN(lower) || isNaN(upper)) {
    return undefined;
  }

  return { lower, upper };
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
