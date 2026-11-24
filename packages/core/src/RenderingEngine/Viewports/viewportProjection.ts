import type {
  ProjectionFraming,
  ProjectionRequest,
  ProjectionSnapshot,
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from './ViewportProjectionTypes';
import { ViewportType } from '../../enums';
import type { ViewFraming, ViewFramingSelector } from '../../types';
import { planarProjectionAdapter } from './Planar/planarProjectionAdapter';
import type {
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
} from './Planar/PlanarProjectionTypes';
import type {
  PlanarViewFraming,
  PlanarViewState,
} from './Planar/PlanarViewportTypes';
import { volume3DProjectionAdapter } from './Volume3D/volume3DProjectionAdapter';
import type {
  Volume3DProjectionFraming,
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
  ProjectionSnapshot<unknown, ProjectionFraming<unknown>>
>;

export type BuiltInViewportProjectionByKind = {
  planar: {
    framing: PlanarViewFraming;
    request: PlanarProjectionRequest;
    snapshot: PlanarProjectionSnapshot;
    viewState: PlanarViewState;
    viewportType: ViewportType.PLANAR;
  };
  volume3d: {
    framing: Volume3DProjectionFraming;
    request: Volume3DProjectionRequest;
    snapshot: Volume3DProjectionSnapshot;
    viewState: Volume3DCamera;
    viewportType: ViewportType.VOLUME_3D;
  };
  video: {
    framing: ViewFraming;
    request: VideoProjectionRequest;
    snapshot: VideoProjectionSnapshot;
    viewState: VideoViewState;
    viewportType: ViewportType.VIDEO;
  };
  ecg: {
    framing: ViewFraming;
    request: ECGProjectionRequest;
    snapshot: ECGProjectionSnapshot;
    viewState: ECGViewState;
    viewportType: ViewportType.ECG;
  };
  wsi: {
    framing: ViewFraming;
    request: WSIProjectionRequest;
    snapshot: WSIProjectionSnapshot;
    viewState: WSIViewState;
    viewportType: ViewportType.WHOLE_SLIDE;
  };
};

export type BuiltInViewportProjectionKind =
  keyof BuiltInViewportProjectionByKind;

export type BuiltInViewportProjectionByType = {
  [ViewportType.PLANAR]: BuiltInViewportProjectionByKind['planar'];
  [ViewportType.VOLUME_3D]: BuiltInViewportProjectionByKind['volume3d'];
  [ViewportType.VIDEO]: BuiltInViewportProjectionByKind['video'];
  [ViewportType.ECG]: BuiltInViewportProjectionByKind['ecg'];
  [ViewportType.WHOLE_SLIDE]: BuiltInViewportProjectionByKind['wsi'];
};

export type BuiltInViewportProjectionType =
  keyof BuiltInViewportProjectionByType;

export type ProjectionSnapshotForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['snapshot'];

export type ProjectionFramingForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['framing'];

export type ProjectionViewStateForKind<
  TKind extends BuiltInViewportProjectionKind,
> = BuiltInViewportProjectionByKind[TKind]['viewState'];

export type ProjectionSnapshotForViewportType<
  TViewportType extends BuiltInViewportProjectionType,
> = BuiltInViewportProjectionByType[TViewportType]['snapshot'];

export type ProjectionFramingForViewportType<
  TViewportType extends BuiltInViewportProjectionType,
> = BuiltInViewportProjectionByType[TViewportType]['framing'];

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

/**
 * The request for a family that is named by `kind`. Its selector takes the
 * keys of the legacy selector and one boolean for every other key of the
 * framing of the family, such as `scale` of the planar viewport.
 */
type ProjectionRequestForKind<TKind extends BuiltInViewportProjectionKind> =
  Omit<
    BuiltInViewportProjectionByKind[TKind]['request'],
    'viewport' | 'selector'
  > & {
    kind: TKind;
    selector?: ViewFramingSelector & {
      [TKey in Exclude<
        keyof BuiltInViewportProjectionByKind[TKind]['framing'],
        keyof ViewFramingSelector
      >]?: boolean;
    };
  };

/**
 * The request for the family of a viewport, taken from its `type`. Its
 * selector takes the keys of the legacy selector and one boolean for every
 * other key of the framing of the family.
 */
type ProjectionRequestForViewport<TViewport extends BuiltInProjectionViewport> =
  Omit<ProjectionForViewport<TViewport>['request'], 'viewport' | 'selector'> & {
    selector?: ViewFramingSelector & {
      [TKey in Exclude<
        keyof ProjectionForViewport<TViewport>['framing'],
        keyof ViewFramingSelector
      >]?: boolean;
    };
  };

export type ProjectionSnapshotForViewport<
  TViewport extends BuiltInProjectionViewport,
> = ProjectionForViewport<TViewport>['snapshot'];

export type ProjectionFramingForViewport<
  TViewport extends BuiltInProjectionViewport,
> = ProjectionForViewport<TViewport>['framing'];

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
    TFraming,
    TSnapshot extends ProjectionSnapshot<
      TViewState,
      ProjectionFraming<unknown>
    >,
  >(adapter: ViewportProjectionAdapter<TViewState, TFraming, TSnapshot>): void {
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
   * view-framing shape.
   */
  getFraming<TKind extends BuiltInViewportProjectionKind>(
    viewport: unknown,
    request: ProjectionRequestForKind<TKind>
  ): ProjectionFramingForKind<TKind> | undefined;
  getFraming<TViewport extends BuiltInProjectionViewport>(
    viewport: TViewport,
    request?: ProjectionRequestForViewport<TViewport>
  ): ProjectionFramingForViewport<TViewport> | undefined;
  getFraming<TFraming = unknown>(
    viewport: unknown,
    request?: Omit<ProjectionRequest, 'viewport'>
  ): TFraming | undefined;
  getFraming<TFraming = unknown>(
    viewport: unknown,
    request: Omit<ProjectionRequest, 'viewport'> = {}
  ): TFraming | undefined {
    const adapter = this.getAdapter(viewport, request);
    const snapshot = adapter?.getSnapshot({
      ...request,
      viewport,
    });

    if (!snapshot) {
      return;
    }

    return adapter.getFraming(snapshot, request.selector) as TFraming;
  }

  /**
   * Resolve a projection snapshot and calculate the next semantic view state
   * for the requested framing patch.
   */
  withFraming<TKind extends BuiltInViewportProjectionKind>(
    viewport: unknown,
    framing: Partial<ProjectionFramingForKind<TKind>>,
    request: ProjectionRequestForKind<TKind>,
    options?: ProjectionWriteOptions
  ): ProjectionViewStateForKind<TKind> | undefined;
  withFraming<TViewport extends BuiltInProjectionViewport>(
    viewport: TViewport,
    framing: Partial<ProjectionFramingForViewport<TViewport>>,
    request?: ProjectionRequestForViewport<TViewport>,
    options?: ProjectionWriteOptions
  ): ProjectionViewStateForViewport<TViewport> | undefined;
  withFraming<TViewState = unknown, TFraming = unknown>(
    viewport: unknown,
    framing: Partial<TFraming>,
    request?: Omit<ProjectionRequest, 'viewport'>,
    options?: ProjectionWriteOptions
  ): TViewState | undefined;
  withFraming<TViewState = unknown, TFraming = unknown>(
    viewport: unknown,
    framing: Partial<TFraming>,
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

    return adapter.withFraming(snapshot, framing, options) as
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
