import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type {
  BlendModes,
  InterpolationType,
  OrientationAxis,
} from '../../../enums';
import type {
  ColormapPublic,
  IImage,
  IImageVolume,
  OrientationVectors,
  Point3,
  VOIRange,
} from '../../../types';
import type { ViewportInput } from '../../../types/IViewport';
import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  LoadedData,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type ICamera from '../../../types/ICamera';
import type { ViewportCameraBase } from '../ViewportCameraTypes';

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
  | OrientationAxis.SAGITTAL
  | OrientationVectors;

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
  colormap?: ColormapPublic;
  voiRange?: VOIRange;
  invert?: boolean;
}

export interface PlanarCamera extends ViewportCameraBase<Point3>, ICamera {
  imageIdIndex?: number;
  orientation?: PlanarOrientation;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

export interface PlanarProperties {
  blendMode?: BlendModes;
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
  renderingEngineId: string;
  type: 'planar';
  viewport: {
    element: HTMLDivElement;
  };
  display: {
    requestRender(): void;
    renderNow(): void;
    activateRenderMode(renderMode: PlanarEffectiveRenderMode): void;
  };
  cpu: {
    canvas: HTMLCanvasElement;
    composition: {
      clearedRenderPassId: number;
      renderPassId: number;
    };
    context: CanvasRenderingContext2D;
  };
  vtk: {
    renderer: vtkRenderer;
    canvas: HTMLCanvasElement;
  };
}

type PlanarContextBase = Pick<
  PlanarViewportRenderContext,
  'viewportId' | 'renderingEngineId' | 'type'
>;

export type PlanarCpuImageAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'viewport' | 'display' | 'cpu'>;

export type PlanarCpuVolumeAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'viewport' | 'display' | 'cpu' | 'vtk'>;

export type PlanarVtkImageAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'display' | 'vtk'>;

export type PlanarVtkVolumeAdapterContext = PlanarContextBase &
  Pick<PlanarViewportRenderContext, 'viewport' | 'display' | 'vtk'>;
