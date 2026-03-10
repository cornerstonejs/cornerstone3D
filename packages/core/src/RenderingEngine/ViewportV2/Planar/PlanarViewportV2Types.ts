import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import type vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
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
  MountedRendering,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';

export type PlanarRenderMode = 'cpu2d' | 'webgl2d' | 'vtkImage' | 'vtkVolume';

export interface PlanarRegisteredDataSet {
  imageIds: string[];
  initialImageIdIndex: number;
  volumeId?: string;
}

export interface PlanarStackPayload {
  imageIds: string[];
  initialImageIdIndex: number;
  initialImage: IImage;
  volumeId: string;
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
  register(dataId: string, dataSet: PlanarRegisteredDataSet): void;
}

export type PlanarViewportV2Input = ViewportInput;

export interface PlanarStackSetOptions {
  dataId?: string;
  initialImageIdIndex?: number;
  renderMode?: PlanarRenderMode;
  volumeId?: string;
}

export interface PlanarViewportBackendContext extends ViewportBackendContext {
  viewportKind: 'planar';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  cpuCanvas?: HTMLCanvasElement;
  cpuCanvasContext?: CanvasRenderingContext2D;
  genericRenderWindow?: vtkGenericRenderWindow;
  renderer: vtkRenderer;
  renderWindow?: vtkRenderWindow;
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
    payload: PlanarStackPayload;
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
    payload: PlanarStackPayload;
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
    payload: PlanarStackPayload;
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
