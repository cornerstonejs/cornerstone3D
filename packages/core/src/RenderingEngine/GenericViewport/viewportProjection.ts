import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from './ViewportProjectionTypes';
import { planarProjectionAdapter } from './Planar/planarProjectionAdapter';
import { volume3DProjectionAdapter } from './Volume3D/volume3DProjectionAdapter';

type ViewportLike = {
  type?: string;
};

type RegisteredProjectionAdapter = ViewportProjectionAdapter<
  unknown,
  unknown,
  ProjectionSnapshot<unknown, ProjectionPresentation<unknown>>
>;

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

export { ViewportProjectionService, viewportProjection };
