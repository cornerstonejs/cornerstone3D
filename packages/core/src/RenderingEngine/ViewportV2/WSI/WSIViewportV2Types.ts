import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  LogicalDataObject,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type {
  WSIClientLike,
  WSIImageDataMetadata,
  WSIImageMetadataSource,
  WSIImageVolumeLike,
  WSIMapLike,
  WSIViewerLike,
} from '../../../utilities/WSIUtilities';

export interface WSIDataSetOptions {
  miniNavigationOverlay?: boolean;
  webClient: WSIClientLike;
}

export interface WSIRegisteredDataSet {
  imageIds: string[];
  options: WSIDataSetOptions;
}

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

export interface WSICamera {
  zoom?: number;
  centerIndex?: [number, number];
  rotation?: number;
}

export interface WSIProperties {}

/** @deprecated Use WSIProperties instead */
export type WSIViewportPresentation = WSIProperties;

/** @deprecated Use WSICamera instead */
export type WSIViewState = WSICamera;

export interface WSIDataProvider extends DataProvider {
  load(dataId: string): Promise<LogicalDataObject<WSIPayload>>;
}

export interface WSIViewportV2Input {
  id: string;
  element: HTMLDivElement;
  dataProvider?: WSIDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface WSIViewportRenderContext extends BaseViewportRenderContext {
  type: 'wsi';
  element: HTMLDivElement;
}

export interface WSIRendering
  extends MountedRendering<{
    microscopyElement: HTMLDivElement;
    viewer: WSIViewerLike;
    map: WSIMapLike;
    payload: WSIPayload;
    postrenderHandler: () => void;
  }> {
  role: 'image';
  renderMode: 'wsi2d';
}
