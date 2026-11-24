import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type { GeometryOptions } from '../../../loaders/geometryLoader';
import type {
  ActorEntry,
  AppearanceColormap,
  ICamera,
  IGeometry,
  IImageVolume,
  ISurface,
  RGB,
  VOIRange,
  Point3,
  ViewportPreset,
} from '../../../types';
import type { VolumeStrategyState } from '../../helpers/volumeStrategyLifecycle';
import type { ViewportInput } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type {
  BlendModes,
  InterpolationType,
  VOILUTFunctionType,
} from '../../../enums';
import type {
  BaseViewportRenderContext,
  BaseAppearanceProps,
  BindingRole,
  DataProvider,
  LoadedData,
  MountedRendering,
  RenderPathResolver,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';
import type { DisplaySetDescriptor } from '../../../types/DisplaySetDescriptor';

/** @internal */
export type Volume3DRenderMode = 'vtkVolume3d' | 'vtkGeometry3d';

/**
 * The descriptor of a display set as a 3D viewport reads it: image ids for a
 * volume, a geometry id for a surface.
 *
 * @internal
 */
export interface Volume3DDisplaySetDescriptor extends DisplaySetDescriptor {
  geometryId?: string;
  geometryLoadOptions?: GeometryOptions;
  imageIds?: string[];
  volumeId?: string;
  /**
   * What the display set shows, such as the labelmap of a segmentation
   * representation. Its actor entry then carries the representation UID.
   */
  reference?: ViewportDataReference;
}

/**
 * The mount options of a display set of a 3D viewport. What a display set
 * shows follows from its descriptor: image ids give a volume, a geometry id
 * (or an id of a geometry of the cache) gives a surface.
 */
export interface Volume3DSetDataOptions {
  role?: BindingRole;
  /**
   * The volume that the display set shows, in place of the `volumeId` of
   * its registration. Without either, the volume id is made from the image
   * ids (`utilities.getDefaultVolumeId`), the same id as a planar viewport
   * in volume mode takes.
   */
  volumeId?: string;
}

/** @internal */
export interface Volume3DVolumePayload {
  imageIds: string[];
  imageVolume: IImageVolume;
  renderMode: 'vtkVolume3d';
  volumeId: string;
  reference?: ViewportDataReference;
}

/** @internal */
export interface Volume3DGeometryPayload {
  geometry: IGeometry;
  geometryId: string;
  renderMode: 'vtkGeometry3d';
  /**
   * What the geometry shows, such as the surface of a segment of a
   * segmentation representation. Its actor entries then carry the
   * representation UID.
   */
  reference?: ViewportDataReference;
}

/** @internal */
export type Volume3DPayload = Volume3DVolumePayload | Volume3DGeometryPayload;

export interface Volume3DAppearanceProps extends BaseAppearanceProps {
  color?: RGB;
  invert?: boolean;
  voiRange?: VOIRange;
  /**
   * A volume rendering preset, by name (one of `CONSTANTS.VIEWPORT_PRESETS`)
   * or as a preset object, as the legacy `setProperties({ preset })`. A later
   * VOI range, invert or opacity keeps its colours.
   */
  preset?: string | ViewportPreset;
  /**
   * The VOI LUT function, LINEAR or SAMPLED_SIGMOID, under the name it has
   * on the planar appearance. The legacy properties call it
   * `VOILUTFunction`.
   */
  voiLUTFunction?: VOILUTFunctionType;
  /**
   * A colormap by name, with an opacity mapping or a threshold. A change is
   * merged into the stored colormap one level deep: each field that is given
   * is applied, the others stay. The opacity function of the volume is
   * `opacity * opacityMapping(value)`, 0 below the threshold.
   */
  colormap?: AppearanceColormap;
  /** The blend mode of the ray cast, as the `blendMode` of a legacy volume input. */
  blendMode?: BlendModes;
  /**
   * The sharpening of the picture, as the legacy `setProperties({
   * sharpening })`: a render pass of the viewport. 0 is none. Read from the
   * current display set.
   */
  sharpening?: number;
  /**
   * The smoothing of the picture, as the legacy `setProperties({ smoothing
   * })`: a render pass of the viewport. 0 is none. Read from the current
   * display set.
   */
  smoothing?: number;
}

export interface Volume3DProperties {
  interpolationType?: InterpolationType;
  sampleDistanceMultiplier?: number;
}

export type Volume3DDisplaySetAppearance = Volume3DAppearanceProps &
  Volume3DProperties;

export interface Volume3DCamera extends ICamera, ViewportCameraBase<Point3> {}

/** @internal */
export interface Volume3DDataProvider extends DataProvider {
  load(
    displaySetId: string,
    options?: {
      renderMode: Volume3DRenderMode;
      volumeId?: string;
    }
  ): Promise<LoadedData<Volume3DPayload>>;
}

export interface VolumeViewport3DInput extends ViewportInput {
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

/** @internal */
export interface Volume3DViewportRenderContext
  extends BaseViewportRenderContext {
  type: '3d';
  viewport: {
    element: HTMLDivElement;
    options: Pick<ViewportInputOptions, 'orientation' | 'parallelProjection'>;
    /**
     * The size, in device pixels, that the rendering engine draws the
     * viewport at since its last resize. The context pool engine sizes the
     * canvas only when it copies the next frame onto it, so until then the
     * canvas still has the old size. Unset before the first resize, when the
     * canvas has that size.
     */
    renderedSize?: { width: number; height: number };
  };
  display: {
    requestRender(): void;
  };
  vtk: {
    canvas: HTMLCanvasElement;
    renderer: vtkRenderer;
  };
}

/**
 * A widget that a tool keeps on a 3D viewport, such as a vtk.js orientation
 * marker widget. The members are those that the viewport and the rendering
 * engines call.
 */
export interface ViewportWidget {
  getEnabled?(): boolean;
  setEnabled?(enabled: boolean): void;
  getActor?(): unknown;
  getRenderer?(): { removeActor(actor: unknown): void } | null;
}

type Volume3DContextBase = Pick<
  Volume3DViewportRenderContext,
  'display' | 'type' | 'viewport' | 'viewportId' | 'vtk'
>;

/** @internal */
export type Volume3DVtkVolumeAdapterContext = Volume3DContextBase;
/** @internal */
export type Volume3DVtkGeometryAdapterContext = Volume3DContextBase;

/** @internal */
export type Volume3DVolumeRendering = MountedRendering<{
  renderMode: 'vtkVolume3d';
  actorEntryUID: string;
  actor: vtkVolume;
  defaultVOIRange?: VOIRange;
  imageVolume: IImageVolume;
  mapper: vtkVolumeMapper;
  removeStreamingSubscriptions?: () => void;
  /**
   * The appearance that the actor shows now. A later appearance changes
   * only what differs from it. Undefined before the first one, and after a
   * reset, when the next appearance builds the transfer functions anew.
   */
  appliedAppearance?: Volume3DDisplaySetAppearance;
}> &
  VolumeStrategyState;

/** @internal */
export type Volume3DGeometryRendering = MountedRendering<{
  renderMode: 'vtkGeometry3d';
  actors: ActorEntry[];
  frameOfReferenceUID?: string;
  /**
   * The points and the polys of the surface that the actor draws, with
   * their number of values when the actor took them. A render builds the
   * poly data of the actor anew when the surface has other arrays, or arrays
   * of another length, as after a face appended in place.
   */
  shownSurface?: Pick<ISurface, 'points' | 'polys'> & {
    pointsLength: number;
    polysLength: number;
  };
}>;

/** @internal */
export type Volume3DRendering =
  | Volume3DVolumeRendering
  | Volume3DGeometryRendering;
