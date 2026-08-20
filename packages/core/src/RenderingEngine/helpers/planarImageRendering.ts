import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { InterpolationType, VOILUTFunctionType } from '../../enums';
import type {
  ColormapPublic,
  CPUFallbackLUT,
  IImage,
  Point3,
  VOIRange,
} from '../../types';
import createLinearRGBTransferFunction from '../../utilities/createLinearRGBTransferFunction';
import createSigmoidRGBTransferFunction from '../../utilities/createSigmoidRGBTransferFunction';
import createVOILUTSequenceTransferFunction, {
  getVOILUTSequenceRange,
  isRenderableVOILUT,
} from '../../utilities/createVOILUTSequenceTransferFunction';
import getVOIRangeFromWindowLevel from '../../utilities/getVOIRangeFromWindowLevel';
import { getValidVOILUTFunction } from '../../utilities/voiLUTFunction';
import isPTPrescaledWithSUV from '../../utilities/isPTPrescaledWithSUV';
import { getImageDataMetadata } from '../../utilities/getImageDataMetadata';
import invertRgbTransferFunction from '../../utilities/invertRgbTransferFunction';
import { resolveColormap } from '../../utilities/colormap';
import { updateVTKImageDataWithCornerstoneImage } from '../../utilities/updateVTKImageDataWithCornerstoneImage';

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}

export interface PlanarImagePresentation {
  visible?: boolean;
  opacity?: number;
  interpolationType?: InterpolationType;
  colormap?: ColormapPublic;
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

  // A VOI LUT Sequence defines the range it is mapped over, and it takes
  // precedence over a window the file may also carry
  if (isRenderableVOILUT(image.voiLUT)) {
    return getVOILUTSequenceRange(image.voiLUT);
  }

  return getVOIRangeFromWindowLevel(
    image.windowWidth,
    image.windowCenter,
    image.voiLUTFunction
  );
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

export function applyPlanarImagePresentation(args: {
  actor: vtkImageSlice;
  defaultVOIRange?: VOIRange;
  defaultVOILUTFunction?: VOILUTFunctionType;
  /**
   * VOI LUT Sequence (0028,3010) of the displayed image. This sequence
   * controls the display. Two conditions stop it: a VOI LUT Function that is
   * different from the function of the image, or a colormap. Refer to
   * createPlanarRGBTransferFunction.
   */
  defaultVOILUT?: CPUFallbackLUT;
  props?: PlanarImagePresentation;
}): void {
  const {
    actor,
    defaultVOIRange,
    defaultVOILUTFunction,
    defaultVOILUT,
    props,
  } = args;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;
  // This rule is the same as the rule in
  // StackViewport._getVOILUTSequenceToApply. Only one of the two can control
  // the display. Thus a VOI LUT Function that is different from the function
  // of the image stops the VOI LUT Sequence of the file. A function that is
  // equal to the function of the image does not stop it. An absent tag
  // (0028,1056) gives the LINEAR value, and getProperties gives that value to
  // the application. Thus an application that applies the presentation that it
  // read keeps the sequence. A range from the caller also keeps the sequence.
  // The transfer function stretches the curve over that range. Thus window
  // level operations keep the shape that the file specifies.
  const canUseVOILUTSequence =
    props?.voiLUTFunction === undefined ||
    getValidVOILUTFunction(props.voiLUTFunction) ===
      getValidVOILUTFunction(defaultVOILUTFunction);
  let voiLUT;

  if (canUseVOILUTSequence) {
    voiLUT = defaultVOILUT;
  }

  if (props?.visible !== undefined) {
    actor.setVisibility(props.visible);
  }

  if (props?.opacity !== undefined) {
    property.setOpacity(props.opacity);
  }

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
    invert: props?.invert,
    voiRange,
    voiLUTFunction: props?.voiLUTFunction ?? defaultVOILUTFunction,
    voiLUT,
  });

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
}

export function createPlanarRGBTransferFunction(args: {
  colormap?: ColormapPublic;
  invert?: boolean;
  voiRange: VOIRange;
  voiLUTFunction?: VOILUTFunctionType;
  /**
   * VOI LUT Sequence (0028,3010). When present it defines the whole VOI
   * transformation and takes precedence over the window and the VOI LUT
   * Function (C.11.2.1) - a colormap still wins, since that is an explicit
   * display choice rather than file metadata.
   */
  voiLUT?: CPUFallbackLUT;
}): vtkColorTransferFunction {
  const { colormap, invert, voiRange, voiLUTFunction, voiLUT } = args;
  const transferFunction = createVOITransferFunction({
    colormap,
    voiRange,
    voiLUTFunction,
    voiLUT,
  });

  if (invert) {
    invertRgbTransferFunction(transferFunction);
  }

  return transferFunction;
}

function createVOITransferFunction(args: {
  colormap?: ColormapPublic;
  voiRange: VOIRange;
  voiLUTFunction?: VOILUTFunctionType;
  voiLUT?: CPUFallbackLUT;
}): vtkColorTransferFunction {
  const { colormap, voiRange, voiLUTFunction, voiLUT } = args;

  if (colormap?.name !== undefined) {
    return createColormapTransferFunction(colormap, voiRange);
  }

  if (voiLUT) {
    // Stretched over voiRange so window level reshapes the file's curve rather
    // than replacing it
    const voiLUTSequenceTransferFunction = createVOILUTSequenceTransferFunction(
      voiLUT,
      { voiRange }
    );

    if (voiLUTSequenceTransferFunction) {
      return voiLUTSequenceTransferFunction;
    }
  }

  if (voiLUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID) {
    return createSigmoidRGBTransferFunction(voiRange);
  }

  return createLinearRGBTransferFunction(voiRange);
}

function createColormapTransferFunction(
  colormap: ColormapPublic,
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
