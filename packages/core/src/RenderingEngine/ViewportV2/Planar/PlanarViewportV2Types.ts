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
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  LogicalDataObject,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';

export type PlanarRenderMode = 'cpu2d' | 'webgl2d' | 'vtkImage' | 'vtkVolume';
export type PlanarRequestedRenderMode = PlanarRenderMode | 'cpuVolume' | 'auto';
export type PlanarEffectiveRenderMode =
  | 'cpu2d'
  | 'webgl2d'
  | 'vtkImage'
  | 'vtkVolume'
  | 'cpuVolume';
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
  renderMode?: PlanarRequestedRenderMode;
}

export interface PlanarDataLoadOptions {
  acquisitionOrientation?: PlanarCamera['orientation'];
  orientation: PlanarOrientation;
  renderMode: PlanarEffectiveRenderMode;
  volumeId: string;
}

export interface PlanarPayload {
  imageIds: string[];
  initialImageIdIndex: number;
  volumeId: string;
  renderMode: PlanarEffectiveRenderMode;
  acquisitionOrientation?: PlanarCamera['orientation'];
  imageVolume?: IImageVolume;
  initialImage?: IImage;
}

export interface PlanarPresentationProps extends BasePresentationProps {
  voiRange?: VOIRange;
  invert?: boolean;
}

export interface PlanarCamera {
  imageIdIndex?: number;
  orientation?:
    | OrientationAxis.ACQUISITION
    | OrientationAxis.AXIAL
    | OrientationAxis.CORONAL
    | OrientationAxis.SAGITTAL;
  zoom?: number;
  pan?: [number, number];
}

export interface PlanarProperties {
  interpolationType?: InterpolationType;
  slabThickness?: number;
}

/** @deprecated Use PlanarCamera instead */
export type PlanarViewState = PlanarCamera;

/** @deprecated Use PlanarProperties instead */
export type PlanarViewportPresentation = PlanarProperties;

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

export interface PlanarViewportRenderContext extends BaseViewportRenderContext {
  type: 'planar';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  cpuCanvas?: HTMLCanvasElement;
  cpuCanvasContext?: CanvasRenderingContext2D;
  renderer: vtkRenderer;
  vtkCanvas?: HTMLCanvasElement;
  requestRender(): void;
  setRenderMode(renderMode: PlanarEffectiveRenderMode): void;
  setRenderModeVisibility?(renderMode: PlanarEffectiveRenderMode): void;
}

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
}

export interface PlanarImageMapperRendering
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

export interface PlanarCpuImageRendering
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

export interface PlanarCpuVolumeRendering
  extends MountedRendering<{
    actor: vtkVolume;
    mapper: vtkVolumeMapper;
    enabledElement?: CPUFallbackEnabledElement;
    payload: PlanarPayload;
    imageVolume: IImageVolume;
    currentImageIdIndex: number;
    defaultVOIRange?: VOIRange;
    orientation?: PlanarCamera['orientation'];
    sliceCamera: PlanarCameraState;
    renderingInvalidated: boolean;
    currentCamera?: PlanarCamera;
    presentation?: PlanarPresentationProps;
    properties?: PlanarProperties;
    sampledSliceState?: {
      image: IImage;
      focalPoint: Point3;
      translationReferenceFocalPoint: Point3;
      right: Point3;
      up: Point3;
      normal: Point3;
      spacingInNormalDirection: number;
      canvasWidth: number;
      canvasHeight: number;
      interpolationType: InterpolationType;
    };
    pendingVolumeLoadCallback?: boolean;
    removeStreamingSubscriptions?: () => void;
  }> {
  role: 'image';
  renderMode: 'cpuVolume';
}

export interface PlanarVolumeMapperRendering
  extends MountedRendering<{
    actor: vtkVolume;
    imageVolume: IImageVolume;
    mapper: vtkVolumeMapper;
    payload: PlanarPayload;
    currentImageIdIndex: number;
    defaultVOIRange?: VOIRange;
    orientation?: PlanarCamera['orientation'];
    sliceCamera: PlanarCameraState;
    removeStreamingSubscriptions?: () => void;
  }> {
  role: 'image';
  renderMode: 'vtkVolume';
}

export type PlanarRendering =
  | PlanarImageMapperRendering
  | PlanarCpuImageRendering
  | PlanarCpuVolumeRendering
  | PlanarVolumeMapperRendering;
