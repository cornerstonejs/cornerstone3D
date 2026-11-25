import type {
  BaseViewportRenderContext,
  BaseAppearanceProps,
  BindingRole,
  DataProvider,
  LoadedData,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';
import type {
  WSIClientLike,
  WSIImageDataMetadata,
  WSIImageMetadataSource,
  WSIImageVolumeLike,
  WSIMapLike,
  WSITransformUtilitiesLike,
  WSIViewerLike,
} from '../../../utilities/WSIUtilities';
import type ICamera from '../../../types/ICamera';
import type { DisplaySetDescriptor } from '../../../types/DisplaySetDescriptor';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type { VOIRange } from '../../../types';

export interface WSIDataSetOptions {
  miniNavigationOverlay?: boolean;
  webClient: WSIClientLike;
}

/**
 * The descriptor of a slide as a whole slide viewport reads it: its image
 * ids and its web client.
 *
 * @internal
 */
export interface WSIDisplaySetDescriptor extends DisplaySetDescriptor {
  imageIds: string[];
  options: WSIDataSetOptions;
}

/** @internal */
export interface WSIPayload {
  imageIds: string[];
  client: WSIClientLike;
  volumeImages: WSIImageVolumeLike[];
  metadataDicomweb: WSIImageMetadataSource[];
  metadata: WSIImageDataMetadata;
  frameOfReferenceUID: string | null;
  imageURISet: Set<string>;
}

export interface WSIAppearanceProps extends BaseAppearanceProps {}

export interface WSIViewState extends ViewportCameraBase<[number, number]> {
  centerIndex?: [number, number];
  resolution?: number;
  zoom?: number;
  /**
   * The rotation of the view in degrees, as on a planar viewport, on top of
   * the orientation that the microscopy viewer gives the slide. At 0 the
   * slide shows as the viewer and the legacy WSI viewport show it.
   */
  rotation?: number;
}

export type WSICamera = WSIViewState & ICamera;

export interface WSIProperties {
  voiRange?: VOIRange;
  averageWhite?: [number, number, number];
}

export type WSIDisplaySetAppearance = WSIAppearanceProps & WSIProperties;

/** The options of the mount of one slide display set. */
export interface WSIMountOptions {
  /**
   * The role of the display set: the first entry of `setDisplaySets` is the
   * source and the others are overlays when not given.
   */
  role?: BindingRole;
  /**
   * The appearance of the slide from its first draw (its window, average
   * white and opacity), merged over the overrides set before the mount.
   * `DISPLAY_SET_APPEARANCE_CHANGED` fires once for it, with cause
   * `'mount'`.
   */
  appearance?: Partial<WSIDisplaySetAppearance>;
}

/** @internal */
export interface WSIDataProvider extends DataProvider {
  load(displaySetId: string): Promise<LoadedData<WSIPayload>>;
}

export interface WSIViewportInput {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  /** The canvas of the element. Without one the viewport makes it. */
  canvas?: HTMLCanvasElement;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
  /** `suppressEvents` turns the camera events off, as on the legacy viewport. */
  defaultOptions?: Pick<ViewportInputOptions, 'suppressEvents'>;
}

/** @internal */
export interface WSIViewportRenderContext extends BaseViewportRenderContext {
  type: 'wsi';
  element: HTMLDivElement;
}

/** @internal */
export type WSIRendering = MountedRendering<{
  renderMode: 'wsi2d';
  microscopyElement: HTMLDivElement;
  viewer: WSIViewerLike;
  map: WSIMapLike;
  transformUtils?: WSITransformUtilitiesLike;
  postrenderHandler: () => void;
  /**
   * The rotation in radians that the microscopy viewer gives the map view of
   * the slide. The rotation of the view state turns the map on top of it.
   */
  slideRotation?: number;
}>;
