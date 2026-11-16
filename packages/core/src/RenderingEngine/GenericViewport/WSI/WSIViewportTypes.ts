import type {
  BaseViewportRenderContext,
  BasePresentationProps,
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
import type { VOIRange } from '../../../types';

export interface WSIDataSetOptions {
  miniNavigationOverlay?: boolean;
  webClient: WSIClientLike;
}

/** @internal */
export interface WSIRegisteredDataSet {
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

export interface WSIPresentationProps extends BasePresentationProps {}

export interface WSIViewState extends ViewportCameraBase<[number, number]> {
  centerIndex?: [number, number];
  resolution?: number;
  zoom?: number;
  /**
   * The rotation of the view in radians, on top of the orientation that the
   * microscopy viewer gives the slide. At 0 the slide shows as the viewer
   * and the legacy WSI viewport show it.
   */
  rotation?: number;
}

export type WSICamera = WSIViewState & ICamera;

export interface WSIProperties {
  voiRange?: VOIRange;
  averageWhite?: [number, number, number];
}

export type WSIDataPresentation = WSIPresentationProps & WSIProperties;

/** @internal */
export interface WSIDataProvider extends DataProvider {
  load(dataId: string): Promise<LoadedData<WSIPayload>>;
}

export interface WSIViewportInput {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export type WSIGenericViewportInput = WSIViewportInput;

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
