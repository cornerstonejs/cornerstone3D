import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  LoadedData,
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

export type WSIDataPresentation = WSIPresentationProps & WSIProperties;

export interface WSIDataProvider extends DataProvider {
  load(dataId: string): Promise<LoadedData<WSIPayload>>;
}

export interface WSIViewportV2Input {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: WSIDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface WSIViewportRenderContext extends BaseViewportRenderContext {
  type: 'wsi';
  element: HTMLDivElement;
}

export type WSIRendering = MountedRendering<{
  renderMode: 'wsi2d';
  microscopyElement: HTMLDivElement;
  viewer: WSIViewerLike;
  map: WSIMapLike;
  postrenderHandler: () => void;
}>;
