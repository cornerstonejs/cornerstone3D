import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import {
  InterpolationType,
  MetadataModules,
  VOILUTFunctionType,
} from '../../enums';
import * as metaData from '../../metaData';
import type { AppearanceColormap, IImage, Point3, VOIRange } from '../../types';
import createLinearRGBTransferFunction from '../../utilities/createLinearRGBTransferFunction';
import createSigmoidRGBTransferFunction from '../../utilities/createSigmoidRGBTransferFunction';
import getVOIRangeFromWindowLevel from '../../utilities/getVOIRangeFromWindowLevel';
import isPTPrescaledWithSUV from '../../utilities/isPTPrescaledWithSUV';
import { getImageDataMetadata } from '../../utilities/getImageDataMetadata';
import invertRgbTransferFunction from '../../utilities/invertRgbTransferFunction';
import { resolveColormap } from '../../utilities/colormap';
import {
  getOpacityRampPoints,
  hasOpacityRamp,
} from '../../utilities/opacityRamp';
import { updateVTKImageDataWithCornerstoneImage } from '../../utilities/updateVTKImageDataWithCornerstoneImage';

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}

export interface PlanarImageAppearance {
  visible?: boolean;
  opacity?: number;
  interpolationType?: InterpolationType;
  colormap?: AppearanceColormap;
  voiRange?: VOIRange;
  voiLUTFunction?: VOILUTFunctionType;
  invert?: boolean;
}

export interface PlanarImageViewState {
  zoom?: number;
  pan?: [number, number];
}

export function createEmptyVTKImageData(args: {
  dimensions: Point3;
  direction: number[] | ArrayLike<number>;
  numberOfComponents: number;
  origin: Point3;
  pixelArray: ArrayLike<number>;
  spacing: Point3;
}): vtkImageData {
  const {
    dimensions,
    direction,
    numberOfComponents,
    origin,
    pixelArray,
    spacing,
  } = args;
  const values =
    ArrayBuffer.isView(pixelArray) && !(pixelArray instanceof DataView)
      ? pixelArray
      : Array.from(pixelArray);
  const dataType =
    ArrayBuffer.isView(values) && !(values instanceof DataView)
      ? vtkDataArray.getDataType(values as never)
      : undefined;
  const scalarArray = vtkDataArray.newInstance({
    ...(dataType ? { dataType } : {}),
    name: 'Pixels',
    numberOfComponents,
    values,
  });
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(new Float32Array(Array.from(direction)));
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);

  return imageData;
}

export function createVTKImageDataFromImage(image: IImage): vtkImageData {
  const { dimensions, direction, numberOfComponents, origin, spacing } =
    getImageDataMetadata(image);
  // Own a PRIVATE copy of the scalars rather than wrapping the source image's
  // voxelManager buffer by reference. The reuse-in-place scroll path
  // (updateVTKImageDataWithCornerstoneImage -> scalarData.set) overwrites this
  // actor buffer with the *next* frame's pixels; if it aliased the source
  // image's cached buffer, scrolling to another slice would corrupt the first
  // image's cached pixel data, and scrolling back would then render the wrong
  // (previously displayed) slice. Mirrors legacy StackViewport, whose actor
  // buffer is independent of the image cache.
  const pixelArray = image.voxelManager.getScalarData().slice();
  const imageData = createEmptyVTKImageData({
    dimensions,
    direction: Array.from(direction),
    numberOfComponents,
    origin,
    pixelArray,
    spacing,
  });

  updateVTKImageDataWithCornerstoneImage(imageData, image);

  return imageData;
}

/**
 * Refreshes an existing vtkImageData's geometry (origin, direction, spacing) to
 * match a new cornerstone image, mirroring what createVTKImageDataFromImage sets
 * on a freshly built one. The reuse-in-place scroll path only rewrites scalars
 * via updateVTKImageDataWithCornerstoneImage, so without this the actor keeps the
 * previous frame's image plane. Multi-frame stacks (e.g. ultrasound cine) place
 * each frame at a distinct world position and the camera follows that plane on
 * scroll, so a stale origin leaves the actor off the focal plane and the viewport
 * renders black from the second frame onward. Dimensions are intentionally left
 * untouched - the reuse path only runs when they already match.
 */
export function updateVTKImageDataGeometryFromImage(
  imageData: vtkImageData,
  image: IImage
): void {
  const { direction, origin, spacing } = getImageDataMetadata(image);
  imageData.setOrigin(origin);
  imageData.setDirection(new Float32Array(Array.from(direction)));
  imageData.setSpacing(spacing);
}

export function getDefaultImageVOIRange(image: IImage): VOIRange | undefined {
  // Mirror legacy StackViewport._getInitialVOIRange: a prescaled PT (SUV) image
  // defaults to a 0-5 VOI range rather than its raw DICOM window center/width,
  // which is too wide for PET and skews the display. Keyed off the loader-set
  // preScale fields (not image.isPreScaled, which the native path never sets).
  if (isPTPrescaledWithSUV(image)) {
    return { lower: 0, upper: 5 };
  }

  return (
    getVOIRangeFromWindowLevel(
      image.windowWidth,
      image.windowCenter,
      image.voiLUTFunction
    ) ?? getImagePixelValueRange(image)
  );
}

/**
 * The range of the pixel values of a grayscale image, for an image without a
 * window. The legacy stack viewport shows such an image with the range of its
 * pixel data. A colour image gets no range: its colours are drawn as they are.
 */
function getImagePixelValueRange(image: IImage): VOIRange | undefined {
  const { color, minPixelValue, maxPixelValue } = image;

  if (
    color ||
    !Number.isFinite(minPixelValue) ||
    !Number.isFinite(maxPixelValue)
  ) {
    return;
  }

  return { lower: minPixelValue, upper: maxPixelValue };
}

/**
 * Whether an image starts inverted. A MONOCHROME1 image does, as on the
 * legacy stack viewport. The photometric interpretation in the image pixel
 * module decides, as on the GPU path of the legacy stack viewport, its
 * default path. `image.invert`, which the DICOM image loader sets from the
 * same tag and the legacy CPU path reads, decides when the metadata has none.
 */
export function getDefaultImageInvert(image: IImage): boolean {
  const imagePixelModule = metaData.get(
    MetadataModules.IMAGE_PIXEL,
    image.imageId
  ) as { photometricInterpretation?: string } | undefined;
  const photometricInterpretation = imagePixelModule?.photometricInterpretation;

  if (photometricInterpretation) {
    return photometricInterpretation === 'MONOCHROME1';
  }

  return image.invert === true;
}

export function getPlanarCameraState(renderer: vtkRenderer): PlanarCameraState {
  const camera = renderer.getActiveCamera();

  return {
    focalPoint: [...camera.getFocalPoint()] as Point3,
    parallelScale: camera.getParallelScale(),
    position: [...camera.getPosition()] as Point3,
    viewPlaneNormal: [...camera.getViewPlaneNormal()] as Point3,
    viewUp: [...camera.getViewUp()] as Point3,
  };
}

export function applyPlanarImageAppearance(args: {
  actor: vtkImageSlice;
  defaultVOIRange?: VOIRange;
  defaultVOILUTFunction?: VOILUTFunctionType;
  defaultInvert?: boolean;
  props?: PlanarImageAppearance;
}): void {
  const {
    actor,
    defaultVOIRange,
    defaultVOILUTFunction,
    defaultInvert,
    props,
  } = args;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

  if (props?.visible !== undefined) {
    actor.setVisibility(props.visible);
  }

  property.setOpacity(props?.opacity ?? 1);

  if (props?.interpolationType !== undefined) {
    property.setInterpolationType(
      props.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (!voiRange) {
    return;
  }

  const transferFunction = createPlanarRGBTransferFunction({
    colormap: props?.colormap,
    invert: props?.invert ?? defaultInvert,
    voiRange,
    voiLUTFunction: props?.voiLUTFunction ?? defaultVOILUTFunction,
  });

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
  applyPlanarOpacityRamp(actor, props?.colormap);
}

/** The actors whose opacity function `applyPlanarOpacityRamp` set. */
const actorsWithOpacityRamp = new WeakSet<vtkImageSlice>();

/**
 * Sets the opacity function of a planar slice actor to the ramp of a
 * colormap: its `opacityMapping` and its `threshold`, by the rule of every
 * render path (`getOpacityRampPoints`), with an opacity of 1. The opacity of
 * the appearance stays on the property, which the vtk.js mappers multiply
 * with the function for a slice of one value per pixel. Without a mapping and
 * a threshold the function that this set is removed, which the mappers read
 * as 1; a function that another owner set, as the style of a labelmap, stays.
 * A threshold without a mapping spans the range of the data of the actor.
 */
export function applyPlanarOpacityRamp(
  actor: vtkImageSlice,
  colormap: AppearanceColormap | undefined
): void {
  const property = actor.getProperty();

  if (!hasOpacityRamp(colormap)) {
    if (actorsWithOpacityRamp.delete(actor)) {
      property.setScalarOpacity(0, null);
    }
    return;
  }

  const range = colormap.opacityMapping?.length
    ? undefined
    : getActorScalarRange(actor);
  const opacityFunction = vtkPiecewiseFunction.newInstance();
  const points = getOpacityRampPoints(
    {
      opacityMapping: colormap.opacityMapping,
      threshold: colormap.threshold,
    },
    range ? [range.lower, range.upper] : undefined
  );

  points.forEach(([value, opacity]) => {
    opacityFunction.addPoint(value, opacity);
  });
  property.setScalarOpacity(0, opacityFunction);
  actorsWithOpacityRamp.add(actor);
}

/**
 * The range of the data behind an actor: the range of the voxel manager of
 * a volume, else the range of the scalars of its image data.
 */
export function getActorScalarRange(
  actor: vtkImageSlice
): VOIRange | undefined {
  const mapperInputData = actor.getMapper()?.getInputData?.();
  const voxelManager = (
    mapperInputData?.get?.('voxelManager') as
      | { voxelManager?: { getRange?: () => [number, number] } }
      | undefined
  )?.voxelManager;
  const ranges = [
    voxelManager?.getRange?.(),
    mapperInputData?.getPointData?.()?.getScalars?.()?.getRange?.(),
  ];
  const range = ranges.find(
    (candidate) =>
      candidate &&
      Number.isFinite(candidate[0]) &&
      Number.isFinite(candidate[1]) &&
      candidate[1] > candidate[0]
  );

  return range ? { lower: range[0], upper: range[1] } : undefined;
}

export function createPlanarRGBTransferFunction(args: {
  colormap?: AppearanceColormap;
  invert?: boolean;
  voiRange: VOIRange;
  voiLUTFunction?: VOILUTFunctionType;
}): vtkColorTransferFunction {
  const { colormap, invert, voiRange, voiLUTFunction } = args;
  const transferFunction =
    colormap?.name !== undefined
      ? createColormapTransferFunction(colormap, voiRange)
      : voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID
        ? createSigmoidRGBTransferFunction(voiRange)
        : createLinearRGBTransferFunction(voiRange);

  if (invert) {
    invertRgbTransferFunction(transferFunction);
  }

  return transferFunction;
}

function createColormapTransferFunction(
  colormap: AppearanceColormap,
  voiRange: VOIRange
): vtkColorTransferFunction {
  const colormapName = colormap.name;
  const colormapDefinition = colormapName
    ? resolveColormap(colormapName)
    : undefined;

  if (!colormapDefinition) {
    throw new Error(`Colormap ${colormapName} not found`);
  }

  const transferFunction = vtkColorTransferFunction.newInstance();

  transferFunction.applyColorMap(colormapDefinition);
  transferFunction.setMappingRange(voiRange.lower, voiRange.upper);

  return transferFunction;
}

export function applyPlanarCameraViewState(args: {
  initialCamera: PlanarCameraState;
  renderer: vtkRenderer;
  viewState?: PlanarImageViewState;
}): void {
  const { initialCamera, renderer, viewState } = args;
  const camera = renderer.getActiveCamera();
  const zoom = Math.max(viewState?.zoom ?? 1, 0.001);
  const [panX, panY] = viewState?.pan ?? [0, 0];

  camera.setParallelProjection(true);
  camera.setParallelScale(initialCamera.parallelScale / zoom);
  camera.setFocalPoint(
    initialCamera.focalPoint[0] + panX,
    initialCamera.focalPoint[1] + panY,
    initialCamera.focalPoint[2]
  );
  camera.setPosition(
    initialCamera.position[0] + panX,
    initialCamera.position[1] + panY,
    initialCamera.position[2]
  );
}
