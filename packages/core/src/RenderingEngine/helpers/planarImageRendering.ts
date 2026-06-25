import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { InterpolationType, VOILUTFunctionType } from '../../enums';
import type { ColormapPublic, IImage, Point3, VOIRange } from '../../types';
import createLinearRGBTransferFunction from '../../utilities/createLinearRGBTransferFunction';
import createSigmoidRGBTransferFunction from '../../utilities/createSigmoidRGBTransferFunction';
import getVOIRangeFromWindowLevel from '../../utilities/getVOIRangeFromWindowLevel';
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
  const pixelArray = image.voxelManager.getScalarData();
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

export function getDefaultImageVOIRange(image: IImage): VOIRange | undefined {
  // Mirror legacy StackViewport._getInitialVOIRange: a prescaled PT (SUV) image
  // defaults to a 0-5 VOI range rather than its raw DICOM window center/width,
  // which is too wide for PET and skews the display. Keyed off the loader-set
  // preScale fields (not image.isPreScaled, which the native path never sets).
  if (isPTPrescaledWithSUV(image)) {
    return { lower: 0, upper: 5 };
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
  props?: PlanarImagePresentation;
}): void {
  const { actor, defaultVOIRange, defaultVOILUTFunction, props } = args;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

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
  });

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
}

export function createPlanarRGBTransferFunction(args: {
  colormap?: ColormapPublic;
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
