import type {
  ActorEntry,
  DisplayArea,
  ICamera,
  ImageSetOptions,
  Point2,
  Point3,
  ViewportInput,
  VOIRange,
  ViewPresentation,
  ViewPresentationSelector,
  WSIViewportProperties,
} from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';
import { deepClone } from '../../../utilities/deepClone';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import { coreLog } from '../../../utilities/logger';
import type { WSIClientLike } from '../../../utilities/WSIUtilities';
import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import { viewportProjection } from '../viewportProjection';
import { canvasToIndexForWSI } from './wsiTransformUtils';
import WSIViewport from './WSIViewport';
import type {
  WSICamera,
  WSIViewState,
  WSIViewportInput,
} from './WSIViewportTypes';

const log = coreLog.getLogger('RenderingEngine', 'WSIViewportLegacyAdapter');

class WSIViewportLegacyAdapter extends WSIViewport {
  /**
   * The canvas of the viewport element, as on the legacy viewports. The slide
   * is drawn by the microscopy viewer, so this canvas holds no pixels of it.
   */
  readonly canvas: HTMLCanvasElement;

  /** The options that the viewport was made with. */
  readonly defaultOptions: ViewportInputOptions;

  /** Whether the viewport fires no events, from the default options. */
  readonly suppressEvents: boolean;

  /**
   * False until the rendering engine disables the viewport, as on the legacy
   * viewports. The engine sets it to true.
   */
  isDisabled = false;

  /**
   * The options of the viewport, as on the legacy viewport: a copy of the
   * default options until `setOptions` or `reset` changes them.
   */
  options: ViewportInputOptions;

  /**
   * The focal point of the view when the slide was mounted, or when a pan
   * was stored as the initial camera. `getPan` is relative to it.
   */
  private initialFocalPoint?: Point3;

  constructor(
    args: WSIViewportInput &
      Partial<Pick<ViewportInput, 'canvas' | 'defaultOptions'>>
  ) {
    super(args);
    this.canvas = args.canvas || getOrCreateCanvas(this.element);
    this.defaultOptions = deepClone(args.defaultOptions || {});
    this.options = deepClone(this.defaultOptions);
    this.suppressEvents = Boolean(this.defaultOptions.suppressEvents);
  }

  /** The id of the viewport. The legacy WSI viewport never set it. */
  get uid(): string {
    return this.id;
  }

  /**
   * Mounts the slides as the next viewport does, and keeps the focal point
   * of the first view as the origin of `getPan`.
   */
  async setDisplaySets(
    ...entries: Array<{ displaySetId: string }>
  ): Promise<void> {
    this.initialFocalPoint = undefined;
    await super.setDisplaySets(...entries);
    this.initialFocalPoint = this.getResolvedView()?.toICamera().focalPoint;
  }

  /**
   * The canvas offset of the view from the view at mount time, in canvas
   * pixels: where the focal point of that first view now shows, less the
   * centre of the canvas. It is `[0, 0]` until a slide is shown.
   */
  getPan(): Point2 {
    const resolvedView = this.getResolvedView();

    if (!resolvedView || !this.initialFocalPoint) {
      return [0, 0];
    }

    const initialCanvas = resolvedView.worldToCanvas(this.initialFocalPoint);

    return [
      initialCanvas[0] - this.element.clientWidth / 2,
      initialCanvas[1] - this.element.clientHeight / 2,
    ];
  }

  /**
   * Moves the view so that `getPan` gives this pan. A change under one
   * canvas pixel is skipped, as on the legacy viewports. With
   * `storeAsInitialCamera` the view after the move becomes the origin of
   * `getPan`.
   */
  setPan(pan: Point2, storeAsInitialCamera = false): void {
    const currentPan = this.getPan();
    const delta = [pan[0] - currentPan[0], pan[1] - currentPan[1]];

    if (
      Math.abs(delta[0]) >= 1 ||
      Math.abs(delta[1]) >= 1 ||
      storeAsInitialCamera
    ) {
      this.setCamera({
        focalPoint: this.canvasToWorld([
          this.element.clientWidth / 2 - delta[0],
          this.element.clientHeight / 2 - delta[1],
        ]),
      });
    }

    if (storeAsInitialCamera) {
      this.initialFocalPoint = this.getResolvedView()?.toICamera().focalPoint;
    }
  }

  /** No actors: the microscopy viewer draws the slide. */
  getActors(): ActorEntry[] {
    return [];
  }

  /** Undefined: a WSI viewport has no actors. */
  getDefaultActor(): ActorEntry | undefined {
    return undefined;
  }

  /** Undefined: a WSI viewport has no actors. */
  getActor(_actorUID: string): ActorEntry | undefined {
    return undefined;
  }

  /** Returns the canvas of the viewport element. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Sets the options of the viewport and renders when `immediate` is set. A
   * display area or an aspect ratio in the options is not applied, and the
   * adapter logs a warning for them.
   */
  setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = deepClone(options);

    if (this.options?.displayArea || this.options?.aspectRatio) {
      log.warn(
        'A WSI viewport does not apply the display area or the aspect ratio of its options'
      );
    }

    if (immediate) {
      this.render();
    }
  }

  /**
   * Sets the options back to the default options, as on the legacy viewport,
   * and renders when `immediate` is set.
   */
  reset(immediate = false): void {
    this.options = deepClone(this.defaultOptions);

    if (immediate) {
      this.render();
    }
  }

  /** Always false, as on the legacy viewports: the view plane stays the same. */
  isOrientationChangeable(): boolean {
    return false;
  }

  /** The display area of the options, as on the legacy viewport. */
  getDisplayArea(): DisplayArea | undefined {
    return this.options?.displayArea;
  }

  setCamera(cameraPatch: Partial<WSICamera>): void {
    const viewStatePatch: Partial<WSIViewState> = {};

    if (typeof cameraPatch.zoom === 'number') {
      viewStatePatch.zoom = cameraPatch.zoom;
    }
    if (cameraPatch.centerIndex) {
      viewStatePatch.centerIndex = [
        cameraPatch.centerIndex[0],
        cameraPatch.centerIndex[1],
      ];
    }
    if (typeof cameraPatch.rotation === 'number') {
      viewStatePatch.rotation = cameraPatch.rotation;
    }
    if (typeof cameraPatch.resolution === 'number') {
      viewStatePatch.resolution = cameraPatch.resolution;
    }

    if (typeof cameraPatch.parallelScale === 'number') {
      const spacing = this.getImageData()?.spacing?.[0];

      if (typeof spacing === 'number' && spacing > 0) {
        const worldToCanvasRatio =
          this.element.clientHeight /
          Math.max(cameraPatch.parallelScale, 0.001);

        viewStatePatch.resolution = 1 / spacing / worldToCanvasRatio;
      }
    }

    if (cameraPatch.focalPoint) {
      const view = this.getView();

      if (view) {
        const newCanvas = this.worldToCanvas(cameraPatch.focalPoint as Point3);
        const newIndex = canvasToIndexForWSI({
          canvasPos: newCanvas as Point2,
          canvasWidth: this.element.clientWidth,
          canvasHeight: this.element.clientHeight,
          view,
        });

        viewStatePatch.centerIndex = [newIndex[0], newIndex[1]];
      }
    }

    if (Object.keys(viewStatePatch).length) {
      this.setViewState(viewStatePatch);
    }
  }

  getCamera(): WSIViewState & ICamera {
    return {
      ...this.getViewState(),
      ...this.getCameraForEvent(),
    } as WSIViewState & ICamera;
  }

  setDataIds(
    imageIds: string[],
    options?: ImageSetOptions & {
      miniNavigationOverlay?: boolean;
      webClient?: WSIClientLike;
    }
  ) {
    const dataId = imageIds[0];

    if (!dataId) {
      return;
    }

    const webClient =
      options?.webClient ||
      metaData.get(MetadataModules.WADO_WEB_CLIENT, dataId);

    if (!webClient) {
      throw new Error(
        `To use setDataIds on WSI data, you must provide metaData.webClient for ${dataId}.`
      );
    }

    genericViewportDisplaySetMetadataProvider.add(dataId, {
      imageIds,
      kind: 'wsi',
      options: {
        miniNavigationOverlay: options?.miniNavigationOverlay,
        webClient,
      },
    });

    return this.setDisplaySets({ displaySetId: dataId });
  }

  async setWSI(imageIds: string[], client: WSIClientLike) {
    return this.setDataIds(imageIds, {
      webClient: client,
    });
  }

  setProperties(props: WSIViewportProperties): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      voiRange: props.voiRange,
    });
  }

  getProperties(): WSIViewportProperties {
    const dataId = this.getActiveDataId();
    const dataPresentation = dataId
      ? this.getDisplaySetPresentation(dataId)
      : undefined;

    return {
      voiRange: dataPresentation?.voiRange,
    };
  }

  resetProperties(): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, {
      averageWhite: undefined,
      voiRange: {
        lower: 0,
        upper: 255,
      },
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(
    selector?: ViewPresentationSelector
  ): ViewPresentation | undefined {
    return viewportProjection.getPresentation<ViewPresentation>(this, {
      selector,
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const nextViewState = viewportProjection.withPresentation<
      WSIViewState,
      ViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Direct Next viewports should use
   * `resetViewState`.
   */
  resetCamera(): boolean {
    return this.resetViewState();
  }

  setVOI(voiRange: VOIRange): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { voiRange });
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    const dataId = this.getActiveDataId();

    if (!dataId) {
      return;
    }

    this.setDisplaySetPresentation(dataId, { averageWhite });
  }
}

export default WSIViewportLegacyAdapter;
