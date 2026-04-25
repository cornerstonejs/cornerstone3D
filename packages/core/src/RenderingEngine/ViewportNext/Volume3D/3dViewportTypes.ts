import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type { GeometryOptions } from '../../../loaders/geometryLoader';
import type {
  ActorEntry,
  ICamera,
  IGeometry,
  IImageVolume,
  RGB,
  VOIRange,
  Point3,
} from '../../../types';
import type { ViewportInput } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type { InterpolationType } from '../../../enums';
import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  BindingRole,
  DataProvider,
  LoadedData,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';

export type Volume3DRenderMode = 'vtkVolume3d' | 'vtkGeometry3d';
export type Volume3DRequestedRenderMode = Volume3DRenderMode | 'auto';

export interface Volume3DRegisteredDataSet {
  actorUID?: string;
  geometryId?: string;
  geometryLoadOptions?: GeometryOptions;
  imageIds?: string[];
  volumeId?: string;
}

export interface Volume3DSetDataOptions {
  renderMode?: Volume3DRequestedRenderMode;
  role?: BindingRole;
}

export interface Volume3DVolumePayload {
  actorUID?: string;
  imageIds: string[];
  imageVolume: IImageVolume;
  renderMode: 'vtkVolume3d';
  volumeId: string;
}

export interface Volume3DGeometryPayload {
  geometry: IGeometry;
  geometryId: string;
  renderMode: 'vtkGeometry3d';
}

export type Volume3DPayload = Volume3DVolumePayload | Volume3DGeometryPayload;

export interface Volume3DPresentationProps extends BasePresentationProps {
  color?: RGB;
  invert?: boolean;
  voiRange?: VOIRange;
}

export interface Volume3DProperties {
  interpolationType?: InterpolationType;
  sampleDistanceMultiplier?: number;
}

export type Volume3DDataPresentation = Volume3DPresentationProps &
  Volume3DProperties;

export interface Volume3DCamera extends ICamera, ViewportCameraBase<Point3> {}

export interface Volume3DDataProvider extends DataProvider {
  load(
    dataId: string,
    options?: {
      renderMode: Volume3DRenderMode;
    }
  ): Promise<LoadedData<Volume3DPayload>>;
}

export interface VolumeViewport3DV2Input extends ViewportInput {
  dataProvider?: Volume3DDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface Volume3DViewportRenderContext
  extends BaseViewportRenderContext {
  type: '3d';
  viewport: {
    element: HTMLDivElement;
    options: Pick<ViewportInputOptions, 'orientation' | 'parallelProjection'>;
  };
  display: {
    requestRender(): void;
  };
  vtk: {
    canvas: HTMLCanvasElement;
    renderer: vtkRenderer;
  };
}

type Volume3DContextBase = Pick<
  Volume3DViewportRenderContext,
  'display' | 'type' | 'viewport' | 'viewportId' | 'vtk'
>;

export type Volume3DVtkVolumeAdapterContext = Volume3DContextBase;
export type Volume3DVtkGeometryAdapterContext = Volume3DContextBase;

export type Volume3DVolumeRendering = MountedRendering<{
  renderMode: 'vtkVolume3d';
  actor: vtkVolume;
  defaultVOIRange?: VOIRange;
  imageVolume: IImageVolume;
  mapper: vtkVolumeMapper;
  removeStreamingSubscriptions?: () => void;
}>;

export type Volume3DGeometryRendering = MountedRendering<{
  renderMode: 'vtkGeometry3d';
  actors: ActorEntry[];
  frameOfReferenceUID?: string;
}>;

export type Volume3DRendering =
  | Volume3DVolumeRendering
  | Volume3DGeometryRendering;
