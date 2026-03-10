import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type { InterpolationType, OrientationAxis } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  IImage,
  IImageVolume,
  Point3,
  VOIRange,
} from '../../../types';
import type { ViewportInput } from '../../../types/IViewport';
import type {
  BasePresentationProps,
  DataProvider,
  LogicalDataObject,
  MountedRendering,
  RenderPathResolver,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';

export type PlanarRenderMode = 'cpu2d' | 'webgl2d' | 'vtkImage' | 'vtkVolume';
export type PlanarOrientation =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL;

export interface PlanarRegisteredDataSet {
  imageIds: string[];
  initialImageIdIndex?: number;
  volumeId?: string;
}

export interface PlanarSetDataOptions {
  orientation?: PlanarOrientation;
  cpuVoxelThreshold?: number;
}

export interface PlanarDataLoadOptions {
  acquisitionOrientation?: PlanarViewState['orientation'];
  orientation: PlanarOrientation;
  renderMode: PlanarRenderMode;
  volumeId: string;
}

export interface PlanarPayload {
  imageIds: string[];
  initialImageIdIndex: number;
  volumeId: string;
  renderMode: PlanarRenderMode;
  acquisitionOrientation?: PlanarViewState['orientation'];
  imageVolume?: IImageVolume;
  initialImage?: IImage;
}

export interface PlanarPresentationProps extends BasePresentationProps {
  voiRange?: VOIRange;
  invert?: boolean;
  interpolationType?: InterpolationType;
}

export interface PlanarViewState {
  imageIdIndex?: number;
  orientation?:
    | OrientationAxis.AXIAL
    | OrientationAxis.CORONAL
    | OrientationAxis.SAGITTAL;
  zoom?: number;
  pan?: [number, number];
}

export interface PlanarDataProvider extends DataProvider {
  load(
    dataId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LogicalDataObject<PlanarPayload>>;
}

export interface PlanarViewportV2Input extends ViewportInput {
  dataProvider?: PlanarDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface PlanarViewportBackendContext extends ViewportBackendContext {
  viewportKind: 'planar';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  cpuCanvas?: HTMLCanvasElement;
  cpuCanvasContext?: CanvasRenderingContext2D;
  renderer: vtkRenderer;
  vtkCanvas?: HTMLCanvasElement;
  requestRender(): void;
  setRenderMode(renderMode: PlanarRenderMode): void;
  setRenderModeVisibility?(renderMode: PlanarRenderMode): void;
}

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
}

export interface PlanarImageRendering
  extends MountedRendering<{
    actor: vtkImageSlice;
    mapper: vtkImageMapper;
    imageData: vtkImageData;
    payload: PlanarPayload;
    currentImageIdIndex: number;
    defaultVOIRange?: VOIRange;
    initialCamera: PlanarCameraState;
    loadRequestId: number;
  }> {
  role: 'image';
  renderMode: 'vtkImage';
}

export interface PlanarCpuRendering
  extends MountedRendering<{
    enabledElement: CPUFallbackEnabledElement;
    payload: PlanarPayload;
    currentImageIdIndex: number;
    defaultVOIRange?: VOIRange;
    fitScale: number;
    loadRequestId: number;
    renderingInvalidated: boolean;
  }> {
  role: 'image';
  renderMode: 'cpu2d';
}

export interface PlanarVolumeRendering
  extends MountedRendering<{
    actor: vtkVolume;
    imageVolume: IImageVolume;
    mapper: vtkVolumeMapper;
    payload: PlanarPayload;
    currentImageIdIndex: number;
    defaultVOIRange?: VOIRange;
    orientation?: PlanarViewState['orientation'];
    sliceCamera: PlanarCameraState;
  }> {
  role: 'image';
  renderMode: 'vtkVolume';
}

export type PlanarRendering =
  | PlanarImageRendering
  | PlanarCpuRendering
  | PlanarVolumeRendering;
