import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type {
  BlendModes,
  InterpolationType,
  OrientationAxis,
} from '../../../enums';
import type {
  ActorEntry,
  ActorRenderMode,
  ColormapPublic,
  IImage,
  IImageVolume,
  OrientationVectors,
  Point2,
  Point3,
  VOIRange,
} from '../../../types';
import type { ViewportInput } from '../../../types/IViewport';
import type {
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  BindingRole,
  DataProvider,
  LoadedData,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type ICamera from '../../../types/ICamera';
import type {
  CameraScaleMode,
  ViewportCameraBase,
} from '../ViewportCameraTypes';
import type DisplayArea from '../../../types/displayArea';
import type { PlanarScaleInput } from './planarCameraScale';

export type PlanarRenderMode =
  | ActorRenderMode.CPU_IMAGE
  | 'webgl2d'
  | ActorRenderMode.VTK_IMAGE
  | ActorRenderMode.VTK_VOLUME_SLICE;
export type PlanarRequestedRenderMode =
  | PlanarRenderMode
  | ActorRenderMode.CPU_VOLUME
  | 'auto';
export type PlanarEffectiveRenderMode =
  | ActorRenderMode.CPU_IMAGE
  | 'webgl2d'
  | ActorRenderMode.VTK_IMAGE
  | ActorRenderMode.VTK_VOLUME_SLICE
  | ActorRenderMode.CPU_VOLUME;
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
  image?: IImage;
  imageData?: vtkImageData;
  useWorldCoordinateImageData?: boolean;
  actorUID?: string;
  referencedId?: string;
  representationUID?: string;
}

export interface PlanarSetDataOptions {
  orientation?: PlanarOrientation;
  cpuThresholds?: {
    image?: number;
    volume?: number;
  };
  renderMode?: PlanarRequestedRenderMode;
  role?: BindingRole;
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
  imageData?: vtkImageData;
  useWorldCoordinateImageData?: boolean;
  actorUID?: string;
  referencedId?: string;
  representationUID?: string;
}

export interface PlanarPresentationProps extends BasePresentationProps {
  colormap?: ColormapPublic;
  voiRange?: VOIRange;
  invert?: boolean;
}

export type PlanarDisplayArea = Omit<DisplayArea, 'scale'> & {
  scale?: PlanarScaleInput;
  scaleMode?: CameraScaleMode;
};

export interface PlanarViewPresentation
  extends Omit<ViewPresentation, 'displayArea'> {
  displayArea?: PlanarDisplayArea;
  scale?: Point2;
}

export interface PlanarViewPresentationSelector
  extends ViewPresentationSelector {
  scale?: boolean;
}

export interface PlanarCamera
  extends ViewportCameraBase<Point3, PlanarScaleInput>,
    ICamera<PlanarScaleInput> {
  imageIdIndex?: number;
  orientation?: PlanarOrientation;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  displayArea?: PlanarDisplayArea;
}

export interface PlanarRenderCamera extends ICamera<PlanarScaleInput> {
  presentationScale?: Point2;
  scaleMode?: CameraScaleMode;
}

export interface PlanarProperties {
  blendMode?: BlendModes;
  interpolationType?: InterpolationType;
  slabThickness?: number;
}

export type PlanarDataPresentation = PlanarPresentationProps & PlanarProperties;

export interface PlanarRenderPathRuntime {
  renderMode: PlanarEffectiveRenderMode;
  renderCamera?: PlanarRenderCamera;
}

export interface PlanarDataProvider extends DataProvider {
  load(
    dataId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LoadedData<PlanarPayload>>;
}

export interface PlanarViewportInput extends ViewportInput {
  dataProvider?: PlanarDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface PlanarViewportRenderContext extends BaseViewportRenderContext {
  renderingEngineId: string;
  type: 'planar';
  viewport: {
    element: HTMLDivElement;
    getActiveDataId(): string | undefined;
    getCameraState(): PlanarCamera;
    isCurrentDataId(dataId: string): boolean;
    getOverlayActors(): ActorEntry[];
  };
  renderPath: PlanarRenderPathRuntime;
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
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'display' | 'cpu'
  >;

export type PlanarCpuVolumeAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'display' | 'cpu'
  >;

export type PlanarVtkImageAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'display' | 'vtk'
  >;

export type PlanarVtkVolumeAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'display' | 'vtk'
  >;
