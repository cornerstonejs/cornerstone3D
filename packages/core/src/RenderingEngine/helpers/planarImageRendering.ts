import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { InterpolationType } from '../../enums';
import type { IImage, Point3, VOIRange } from '../../types';
import createLinearRGBTransferFunction from '../../utilities/createLinearRGBTransferFunction';
import getVOIRangeFromWindowLevel from '../../utilities/getVOIRangeFromWindowLevel';
import { getImageDataMetadata } from '../../utilities/getImageDataMetadata';
import invertRgbTransferFunction from '../../utilities/invertRgbTransferFunction';
import { updateVTKImageDataWithCornerstoneImage } from '../../utilities/updateVTKImageDataWithCornerstoneImage';

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
}

export interface PlanarImagePresentation {
  visible?: boolean;
  opacity?: number;
  interpolationType?: InterpolationType;
  voiRange?: VOIRange;
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
  };
}

export function applyPlanarImagePresentation(args: {
  actor: vtkImageSlice;
  defaultVOIRange?: VOIRange;
  props?: PlanarImagePresentation;
}): void {
  const { actor, defaultVOIRange, props } = args;
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

  const transferFunction = createLinearRGBTransferFunction(voiRange);

  if (props?.invert) {
    invertRgbTransferFunction(transferFunction);
  }

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
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
