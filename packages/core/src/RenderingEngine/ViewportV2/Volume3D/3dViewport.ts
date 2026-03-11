import { ViewportType } from '../../../enums';
import type { ActorEntry, ICamera, IImageData } from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAttachmentOptions } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
import { VtkGeometry3DPath } from './VtkGeometry3DRenderPath';
import { VtkVolume3DPath } from './VtkVolume3DRenderPath';
import type {
  Volume3DCamera,
  Volume3DPresentationProps,
  Volume3DProperties,
  Volume3DRegisteredDataSet,
  Volume3DRendering,
  Volume3DSetDataOptions,
  Volume3DViewportRenderContext,
  VolumeViewport3DV2Input,
} from './3dViewportTypes';

defaultRenderPathResolver.register(new VtkVolume3DPath());
defaultRenderPathResolver.register(new VtkGeometry3DPath());

class VolumeViewport3DV2 extends ViewportV2<
  Volume3DCamera,
  Volume3DProperties,
  Volume3DPresentationProps,
  Volume3DViewportRenderContext
> {
  readonly type: ViewportType = ViewportType.VOLUME_3D_V2;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  suppressEvents = false;

  protected renderContext: Volume3DViewportRenderContext;

  private primaryDataId?: string;

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op -- rendering engine calls this after completing a frame
  }

  constructor(args: VolumeViewport3DV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = args.defaultOptions || {};
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVolume3DDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[VolumeViewport3DV2] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    renderer
      .getActiveCamera()
      .setParallelProjection(this.defaultOptions.parallelProjection ?? true);

    this.renderContext = {
      viewportId: this.id,
      type: '3d',
      viewport: {
        element: this.element,
        options: {
          orientation: this.defaultOptions.orientation,
          parallelProjection: this.defaultOptions.parallelProjection,
        },
      },
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
      },
      vtk: {
        canvas: this.canvas,
        renderer,
      },
    };
    this.camera = {
      parallelProjection: this.defaultOptions.parallelProjection ?? true,
    } as Volume3DCamera;
    this.properties = {};

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  async setDataIds(
    dataIds: string[],
    options: Volume3DSetDataOptions = {}
  ): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      renderingIds.push(await this.setDataId(dataId, options));
    }

    return renderingIds;
  }

  async setDataId(
    dataId: string,
    options: Volume3DSetDataOptions | DataAttachmentOptions = {}
  ): Promise<string> {
    const renderMode = this.resolveRenderMode(
      dataId,
      (options as Volume3DSetDataOptions).renderMode
    );
    const renderingId = await super.setDataId(dataId, {
      renderMode,
    });

    if (renderMode === 'vtkVolume3d') {
      this.primaryDataId = dataId;
    }

    this.setPresentation(dataId, {
      visible: true,
      opacity: 1,
      ...(this.getPresentation(dataId) || {}),
    });
    this.camera = this.getCamera();

    return renderingId;
  }

  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  getImageIds(): string[] {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return [];
    }

    const rendering = binding.rendering as Volume3DRendering;

    if (rendering.renderMode !== 'vtkVolume3d') {
      return [];
    }

    return rendering.runtime.payload.imageIds;
  }

  getRenderer() {
    return this.renderContext.vtk.renderer;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getVtkActiveCamera() {
    return this.getRenderer().getActiveCamera();
  }

  getCamera(): Volume3DCamera & ICamera {
    const camera = this.getRenderer().getActiveCamera();

    return {
      clippingRange: camera.getClippingRange(),
      focalPoint: camera.getFocalPoint(),
      parallelProjection: camera.getParallelProjection(),
      parallelScale: camera.getParallelScale(),
      position: camera.getPosition(),
      rotation: 0,
      viewAngle: camera.getViewAngle(),
      viewPlaneNormal: camera.getViewPlaneNormal(),
      viewUp: camera.getViewUp(),
    } as Volume3DCamera & ICamera;
  }

  // TrackballRotateTool preserves 3D view state across resize by round-tripping
  // through these view-presentation methods.
  getViewPresentation(): { camera: Volume3DCamera & ICamera } {
    return {
      camera: this.getCamera(),
    };
  }

  setViewPresentation(
    viewPresentation?:
      | { camera?: Partial<Volume3DCamera> }
      | Partial<Volume3DCamera>
  ): void {
    if (!viewPresentation) {
      return;
    }

    if (isVolume3DViewPresentation(viewPresentation)) {
      if (viewPresentation.camera) {
        this.setCamera(viewPresentation.camera);
      }

      return;
    }

    this.setCamera(viewPresentation);
  }

  getProperties(): Volume3DPresentationProps & Volume3DProperties {
    return {
      ...(this.primaryDataId ? this.getPresentation(this.primaryDataId) : {}),
      ...this.properties,
    };
  }

  setProperties(
    props: Partial<Volume3DPresentationProps & Volume3DProperties>
  ): void {
    const { interpolationType, sampleDistanceMultiplier, ...dataProps } = props;

    if (
      interpolationType !== undefined ||
      sampleDistanceMultiplier !== undefined
    ) {
      super.setProperties({
        ...(interpolationType !== undefined ? { interpolationType } : {}),
        ...(sampleDistanceMultiplier !== undefined
          ? { sampleDistanceMultiplier }
          : {}),
      });
    }

    if (this.primaryDataId && Object.keys(dataProps).length > 0) {
      this.setPresentation(this.primaryDataId, {
        ...(this.getPresentation(this.primaryDataId) || {}),
        ...dataProps,
      });
    }
  }

  getVolumeId(): string | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    const rendering = binding.rendering as Volume3DRendering;

    if (rendering.renderMode !== 'vtkVolume3d') {
      return;
    }

    return rendering.runtime.payload.volumeId;
  }

  hasVolumeId(volumeId: string): boolean {
    return this.getActors().some(
      (actorEntry) => actorEntry.referencedId === volumeId
    );
  }

  hasVolumeURI(volumeURI: string): boolean {
    return this.getActors().some((actorEntry) =>
      String(actorEntry.referencedId || '').includes(volumeURI)
    );
  }

  getImageData(): IImageData | undefined {
    return this.getCurrentBinding()?.getImageData?.() as IImageData | undefined;
  }

  getActors(): ActorEntry[] {
    const actors: ActorEntry[] = [];

    for (const binding of this.bindings.values()) {
      const rendering = binding.rendering as Volume3DRendering;

      if (rendering.renderMode === 'vtkVolume3d') {
        actors.push({
          actor: rendering.runtime.actor,
          referencedId: rendering.runtime.payload.volumeId,
          uid:
            rendering.runtime.payload.actorUID ||
            rendering.runtime.payload.volumeId,
        });
        continue;
      }

      actors.push(...rendering.runtime.actors);
    }

    return actors;
  }

  getDefaultActor(): ActorEntry | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return this.getActors()[0];
    }

    const rendering = binding.rendering as Volume3DRendering;

    if (rendering.renderMode === 'vtkVolume3d') {
      return {
        actor: rendering.runtime.actor,
        referencedId: rendering.runtime.payload.volumeId,
        uid:
          rendering.runtime.payload.actorUID ||
          rendering.runtime.payload.volumeId,
      };
    }

    return rendering.runtime.actors[0];
  }

  resetCamera(): boolean {
    const renderer = this.getRenderer();

    renderer.resetCamera();
    renderer.resetCameraClippingRange();
    this.camera = this.getCamera();
    this.render();

    return true;
  }

  resetCameraForResize(): boolean {
    return this.resetCamera();
  }

  resize(): void {
    this.sWidth = this.canvas.width;
    this.sHeight = this.canvas.height;

    for (const binding of this.bindings.values()) {
      binding.resize?.();
    }
  }

  render(): void {
    let renderedByAdapter = false;

    for (const binding of this.bindings.values()) {
      binding.render?.();
      renderedByAdapter = renderedByAdapter || Boolean(binding.render);
    }

    if (!renderedByAdapter) {
      this.requestRenderingEngineRender();
    }
  }

  protected getCurrentBinding() {
    const dataId = this.primaryDataId ?? this.bindings.keys().next().value;

    if (!dataId) {
      return;
    }

    return this.getBinding(dataId);
  }

  private requestRenderingEngineRender(): void {
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private resolveRenderMode(
    dataId: string,
    requestedRenderMode: Volume3DSetDataOptions['renderMode'] = 'auto'
  ): 'vtkVolume3d' | 'vtkGeometry3d' {
    if (requestedRenderMode && requestedRenderMode !== 'auto') {
      return requestedRenderMode;
    }

    const dataSet = this.getDataSet(dataId);

    if (dataSet?.imageIds?.length) {
      return 'vtkVolume3d';
    }

    return 'vtkGeometry3d';
  }

  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    );

    if (Array.isArray(registered)) {
      return {
        imageIds: registered,
      };
    }

    return registered as Volume3DRegisteredDataSet | undefined;
  }
}

export default VolumeViewport3DV2;

function isVolume3DViewPresentation(
  viewPresentation: unknown
): viewPresentation is { camera?: Partial<Volume3DCamera> } {
  return (
    Boolean(viewPresentation) &&
    typeof viewPresentation === 'object' &&
    'camera' in viewPresentation
  );
}
