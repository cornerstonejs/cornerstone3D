import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from './ViewportProjectionTypes';
import { ViewportType } from '../../enums';
import type { ViewPresentation } from '../../types';
import { planarProjectionAdapter } from './Planar/planarProjectionAdapter';
import type {
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
} from './Planar/PlanarProjectionTypes';
import type {
  PlanarViewPresentation,
  PlanarViewState,
} from './Planar/PlanarViewportTypes';
import { volume3DProjectionAdapter } from './Volume3D/volume3DProjectionAdapter';
import type {
  Volume3DProjectionPresentation,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './Volume3D/Volume3DProjectionTypes';
import type { Volume3DCamera } from './Volume3D/viewport3DTypes';
import { videoProjectionAdapter } from './Video/videoProjectionAdapter';
import type {
  VideoProjectionRequest,
  VideoProjectionSnapshot,
} from './Video/VideoProjectionTypes';
import type { VideoViewState } from './Video/VideoViewportTypes';
import { ecgProjectionAdapter } from './ECG/ecgProjectionAdapter';
import type {
  ECGProjectionRequest,
  ECGProjectionSnapshot,
} from './ECG/ECGProjectionTypes';
import type { ECGViewState } from './ECG/ECGViewportTypes';
import { wsiProjectionAdapter } from './WSI/wsiProjectionAdapter';
import type {
  WSIProjectionRequest,
  WSIProjectionSnapshot,
} from './WSI/WSIProjectionTypes';
import type { WSIViewState } from './WSI/WSIViewportTypes';

type ViewportLike = {
  type?: string;
};

type RegisteredProjectionAdapter = ViewportProjectionAdapter<
  unknown,
  unknown,
  ProjectionSnapshot<unknown, ProjectionPresentation<unknown>>
>;

export type BuiltInViewportProjectionByKind = {
  planar: {
    presentation: PlanarViewPresentation;
    request: PlanarProjectionRequest;
    snapshot: PlanarProjectionSnapshot;
    viewState: PlanarViewState;
    viewportType: ViewportType.PLANAR_NEXT;
  };
  volume3d: {
    presentation: Volume3DProjectionPresentation;
    request: Volume3DProjectionRequest;
    snapshot: Volume3DProjectionSnapshot;
    viewState: Volume3DCamera;
    viewportType: ViewportType.VOLUME_3D_NEXT;
  };
  video: {
    presentation: ViewPresentation;
    request: VideoProjectionRequest;
    snapshot: VideoProjectionSnapshot;
    viewState: VideoViewState;
    viewportType: ViewportType.VIDEO_NEXT;
  };
  ecg: {
    presentation: ViewPresentation;
    request: ECGProjectionRequest;
    snapshot: ECGProjectionSnapshot;
    viewState: ECGViewState;
    viewportType: ViewportType.ECG_NEXT;
  };
  wsi: {
    presentation: ViewPresentation;
    request: WSIProjectionRequest;
    snapshot: WSIProjectionSnapshot;
    viewState: WSIViewState;
    viewportType: ViewportType.WHOLE_SLIDE_NEXT;
  };
};

export type BuiltInViewportProjectionKind =
  keyof BuiltInViewportProjectionByKind;

export type BuiltInViewportProjectionByType = {
  [ViewportType.PLANAR_NEXT]: BuiltInViewportProjectionByKind['planar'];
  [ViewportType.VOLUME_3D_NEXT]: BuiltInViewportProjectionByKind['volume3d'];
  [ViewportType.VIDEO_NEXT]: BuiltInViewportProjectionByKind['video'];
  [ViewportType.ECG_NEXT]: BuiltInViewportProjectionByKind['ecg'];
  [ViewportType.WHOLE_SLIDE_NEXT]: BuiltInViewportProjectionByKind['wsi'];
};

export type BuiltInViewportProjectionType =
  keyof BuiltInViewportProjectionByType;

export type ProjectionSnapshotForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['snapshot'];

export type ProjectionPresentationForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['presentation'];

export type ProjectionViewStateForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['viewState'];

export type ProjectionSnapshotForViewportType<
  TViewportType extends BuiltInViewportProjectionType,
> = BuiltInViewportProjectionByType[TViewportType]['snapshot'];

export type ProjectionPresentationForViewportType<
  TViewportType extends BuiltInViewportProjectionType,
> = BuiltInViewportProjectionByType[TViewportType]['presentation'];

export type ProjectionViewStateForViewportType<
  TViewportType extends BuiltInViewportProjectionType,
> = BuiltInViewportProjectionByType[TViewportType]['viewState'];

type BuiltInProjectionViewport = {
  type: BuiltInViewportProjectionType;
};

type ProjectionForViewport<TViewport> = TViewport extends {
  type: infer TViewportType;
}
  ? TViewportType extends BuiltInViewportProjectionType
    ? BuiltInViewportProjectionByType[TViewportType]
    : never
  : never;

type ProjectionRequestForKind<TKind extends BuiltInViewportProjectionKind> =
  Omit<BuiltInViewportProjectionByKind[TKind]['request'], 'viewport'> & {
    kind: TKind;
  };

type ProjectionRequestForViewport<TViewport extends BuiltInProjectionViewport> =
  Omit<ProjectionForViewport<TViewport>['request'], 'viewport'>;

export type ProjectionSnapshotForViewport<
  TViewport extends BuiltInProjectionViewport,
> = ProjectionForViewport<TViewport>['snapshot'];

export type ProjectionPresentationForViewport<
  TViewport extends BuiltInProjectionViewport,
> = ProjectionForViewport<TViewport>['presentation'];

export type ProjectionViewStateForViewport<
  TViewport extends BuiltInProjectionViewport,
> = ProjectionForViewport<TViewport>['viewState'];

/**
 * Resolve the viewport type used for adapter lookup.
 *
 * Explicit request values win so tests and external callers can query an
 * adapter without requiring a full viewport instance.
 */
function getViewportType(request: ProjectionRequest): string | undefined {
  const viewportType =
    request.viewportType ??
    (request.viewport as ViewportLike | undefined)?.type;

  return viewportType === undefined ? undefined : String(viewportType);
}

/**
 * Package-level viewport projection facade.
 *
 * The service is intentionally global to the package so custom synchronizers
 * can resolve projection behavior without reaching into a rendering engine.
 */
class ViewportProjectionService {
  private readonly adapters = new Map<string, RegisteredProjectionAdapter>();

  /**
   * Register or replace an adapter by id.
   */
  register<
    TViewState,
    TPresentation,
    TSnapshot extends ProjectionSnapshot<
      TViewState,
      ProjectionPresentation<unknown>
    >,
  >(
    adapter: ViewportProjectionAdapter<TViewState, TPresentation, TSnapshot>
  ): void {
    this.adapters.set(
      adapter.id,
      adapter as unknown as RegisteredProjectionAdapter
    );
  }

  /**
   * Remove an adapter by id.
   */
  unregister(adapterId: string): void {
    this.adapters.delete(adapterId);
  }

  /**
   * Find the adapter matching the viewport type and optional projection kind.
   */
  getAdapter(
    viewport: unknown,
    request: Omit<ProjectionRequest, 'viewport'> = {}
  ): RegisteredProjectionAdapter | undefined {
    const projectionRequest: ProjectionRequest = {
      ...request,
      viewport,
    };
    const viewportType = getViewportType(projectionRequest);

    for (const adapter of this.adapters.values()) {
      if (request.kind && adapter.id !== request.kind) {
        continue;
      }

      if (
        viewportType &&
        !adapter.viewportTypes.some((type) => String(type) === viewportType)
      ) {
        continue;
      }

      return adapter;
    }
  }

  /**
   * Resolve a projection snapshot for the given viewport.
   */
  get<TKind extends BuiltInViewportProjectionKind>(
    viewport: unknown,
    request: ProjectionRequestForKind<TKind>
  ): ProjectionSnapshotForKind<TKind> | undefined;
  get<TViewport extends BuiltInProjectionViewport>(
    viewport: TViewport,
    request?: ProjectionRequestForViewport<TViewport>
  ): ProjectionSnapshotForViewport<TViewport> | undefined;
  get<TSnapshot extends ProjectionSnapshot = ProjectionSnapshot>(
    viewport: unknown,
    request?: Omit<ProjectionRequest, 'viewport'>
  ): TSnapshot | undefined;
  get<TSnapshot extends ProjectionSnapshot = ProjectionSnapshot>(
    viewport: unknown,
    request: Omit<ProjectionRequest, 'viewport'> = {}
  ): TSnapshot | undefined {
    const adapter = this.getAdapter(viewport, request);

    return adapter?.getSnapshot({
      ...request,
      viewport,
    }) as TSnapshot | undefined;
  }

  /**
   * Resolve a projection snapshot and convert it to the adapter's public
   * view-presentation shape.
   */
  getPresentation<TKind extends BuiltInViewportProjectionKind>(
    viewport: unknown,
    request: ProjectionRequestForKind<TKind>
  ): ProjectionPresentationForKind<TKind> | undefined;
  getPresentation<TViewport extends BuiltInProjectionViewport>(
    viewport: TViewport,
    request?: ProjectionRequestForViewport<TViewport>
  ): ProjectionPresentationForViewport<TViewport> | undefined;
  getPresentation<TPresentation = unknown>(
    viewport: unknown,
    request?: Omit<ProjectionRequest, 'viewport'>
  ): TPresentation | undefined;
  getPresentation<TPresentation = unknown>(
    viewport: unknown,
    request: Omit<ProjectionRequest, 'viewport'> = {}
  ): TPresentation | undefined {
    const adapter = this.getAdapter(viewport, request);
    const snapshot = adapter?.getSnapshot({
      ...request,
      viewport,
    });

    if (!snapshot) {
      return;
    }

    return adapter.getPresentation(snapshot, request.selector) as TPresentation;
  }

  /**
   * Resolve a projection snapshot and calculate the next semantic view state
   * for the requested presentation patch.
   */
  withPresentation<TKind extends BuiltInViewportProjectionKind>(
    viewport: unknown,
    presentation: Partial<ProjectionPresentationForKind<TKind>>,
    request: ProjectionRequestForKind<TKind>,
    options?: ProjectionWriteOptions
  ): ProjectionViewStateForKind<TKind> | undefined;
  withPresentation<TViewport extends BuiltInProjectionViewport>(
    viewport: TViewport,
    presentation: Partial<ProjectionPresentationForViewport<TViewport>>,
    request?: ProjectionRequestForViewport<TViewport>,
    options?: ProjectionWriteOptions
  ): ProjectionViewStateForViewport<TViewport> | undefined;
  withPresentation<TViewState = unknown, TPresentation = unknown>(
    viewport: unknown,
    presentation: Partial<TPresentation>,
    request?: Omit<ProjectionRequest, 'viewport'>,
    options?: ProjectionWriteOptions
  ): TViewState | undefined;
  withPresentation<TViewState = unknown, TPresentation = unknown>(
    viewport: unknown,
    presentation: Partial<TPresentation>,
    request: Omit<ProjectionRequest, 'viewport'> = {},
    options?: ProjectionWriteOptions
  ): TViewState | undefined {
    const adapter = this.getAdapter(viewport, request);
    const snapshot = adapter?.getSnapshot({
      ...request,
      viewport,
    });

    if (!snapshot) {
      return;
    }

    return adapter.withPresentation(snapshot, presentation, options) as
      | TViewState
      | undefined;
  }

  /**
   * Return registered adapters in registration order.
   */
  getRegisteredAdapters(): RegisteredProjectionAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Remove all adapters. Intended for isolated tests and custom bootstrapping.
   */
  clear(): void {
    this.adapters.clear();
  }
}

const viewportProjection = new ViewportProjectionService();

viewportProjection.register(planarProjectionAdapter);
viewportProjection.register(volume3DProjectionAdapter);
viewportProjection.register(videoProjectionAdapter);
viewportProjection.register(ecgProjectionAdapter);
viewportProjection.register(wsiProjectionAdapter);

export { ViewportProjectionService, viewportProjection };
