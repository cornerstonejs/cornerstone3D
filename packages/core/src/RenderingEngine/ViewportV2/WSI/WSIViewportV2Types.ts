import type {
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
  ViewportBackendContext,
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

export interface WSIViewState {
  zoom?: number;
  centerIndex?: [number, number];
  rotation?: number;
}

export interface WSIDataProvider extends DataProvider {
  register(dataId: string, dataSet: WSIRegisteredDataSet): void;
}

export interface WSIViewportV2Input {
  id: string;
  element: HTMLDivElement;
  dataProvider?: WSIDataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface WSIViewportBackendContext extends ViewportBackendContext {
  viewportKind: 'wsi';
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
