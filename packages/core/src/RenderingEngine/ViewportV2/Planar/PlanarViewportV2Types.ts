import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type { InterpolationType, OrientationAxis } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  ICamera,
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
  LoadedData,
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
  cpuThresholds?: {
    image?: number;
    volume?: number;
  };
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
  image?: IImage;
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
  rotation?: number;
  zoom?: number;
  pan?: [number, number];
}

export interface PlanarProperties {
  interpolationType?: InterpolationType;
  slabThickness?: number;
}

export type PlanarDataPresentation = PlanarPresentationProps & PlanarProperties;

export interface PlanarDataProvider extends DataProvider {
  load(
    dataId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LoadedData<PlanarPayload>>;
}

export interface PlanarViewportV2Input extends ViewportInput {
  dataProvider?: PlanarDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface PlanarViewportRenderContext extends BaseViewportRenderContext {
  type: 'planar';
  viewport: {
    element: HTMLDivElement;
  };
  display: {
    requestRender(): void;
    activateRenderMode(renderMode: PlanarEffectiveRenderMode): void;
  };
  cpu: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  };
  vtk: {
    renderer: vtkRenderer;
    canvas: HTMLCanvasElement;
  };
}

type PlanarContextBase = Pick<
  PlanarViewportRenderContext,
  'viewportId' | 'type'
>;

export type PlanarCpuImageAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'display' | 'cpu'>;

export type PlanarCpuVolumeAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'viewport' | 'display' | 'cpu' | 'vtk'>;

export type PlanarVtkImageAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'display' | 'vtk'>;

export type PlanarVtkVolumeAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'viewport' | 'display' | 'vtk'>;

export interface PlanarCameraState {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}

export type PlanarImageMapperRendering = MountedRendering<{
  renderMode: 'vtkImage';
  actor: vtkImageSlice;
  currentImage: IImage;
  mapper: vtkImageMapper;
  imageData: vtkImageData;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  initialCamera: PlanarCameraState;
  loadRequestId: number;
  camera?: ICamera;
}>;

export type PlanarCpuImageRendering = MountedRendering<{
  renderMode: 'cpu2d';
  enabledElement: CPUFallbackEnabledElement;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  fitScale: number;
  loadRequestId: number;
  camera?: ICamera;
  renderingInvalidated: boolean;
}>;

export type PlanarCpuVolumeRendering = MountedRendering<{
  renderMode: 'cpuVolume';
  actor: vtkVolume;
  mapper: vtkVolumeMapper;
  enabledElement?: CPUFallbackEnabledElement;
  imageVolume: IImageVolume;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  baseCamera?: PlanarCameraState;
  camera?: ICamera;
  viewState?: PlanarCamera;
  renderingInvalidated: boolean;
  dataPresentation?: PlanarDataPresentation;
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
}>;

export type PlanarVolumeMapperRendering = MountedRendering<{
  renderMode: 'vtkVolume';
  actor: vtkVolume;
  imageVolume: IImageVolume;
  mapper: vtkVolumeMapper;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  baseCamera?: PlanarCameraState;
  camera?: ICamera;
  viewState?: PlanarCamera;
  dataPresentation?: PlanarDataPresentation;
  removeStreamingSubscriptions?: () => void;
}>;

export type PlanarRendering =
  | PlanarImageMapperRendering
  | PlanarCpuImageRendering
  | PlanarCpuVolumeRendering
  | PlanarVolumeMapperRendering;
