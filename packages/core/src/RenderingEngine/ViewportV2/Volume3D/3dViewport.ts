import { ViewportType } from '../../../enums';
import type { ActorEntry, ICamera, IImageData } from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAddOptions, LoadedData } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { getViewportV2ImageDataSet } from '../viewportV2DataSetAccess';
import { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
import { VtkGeometry3DPath } from './VtkGeometry3DRenderPath';
import { VtkVolume3DPath } from './VtkVolume3DRenderPath';
import type {
  Volume3DCamera,
  Volume3DPayload,
  Volume3DDataPresentation,
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
  Volume3DDataPresentation,
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
    options: Volume3DSetDataOptions | DataAddOptions = {}
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

    this.setDefaultDataPresentation(dataId, {
      visible: true,
      opacity: 1,
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

    const data = binding.data as unknown as LoadedData<Volume3DPayload>;
    const rendering = binding.rendering as Volume3DRendering;

    if (
      rendering.renderMode !== 'vtkVolume3d' ||
      data.renderMode !== 'vtkVolume3d'
    ) {
      return [];
    }

    return data.imageIds;
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

  getVolumeId(): string | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    const data = binding.data as unknown as LoadedData<Volume3DPayload>;
    const rendering = binding.rendering as Volume3DRendering;

    if (
      rendering.renderMode !== 'vtkVolume3d' ||
      data.renderMode !== 'vtkVolume3d'
    ) {
      return;
    }

    return data.volumeId;
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
      actors.push(
        ...this.getActorEntriesForRendering(
          binding.rendering as Volume3DRendering,
          binding.data as unknown as LoadedData<Volume3DPayload>
        )
      );
    }

    return actors;
  }

  getDefaultActor(): ActorEntry | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return this.getActors()[0];
    }

    const rendering = binding.rendering as Volume3DRendering;

    return this.getActorEntriesForRendering(
      rendering,
      binding.data as unknown as LoadedData<Volume3DPayload>
    )[0];
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

    this.resizeBindings();
  }

  render(): void {
    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  protected getCurrentBinding() {
    if (this.primaryDataId) {
      return this.getBinding(this.primaryDataId) ?? this.getFirstBinding();
    }

    return this.getFirstBinding();
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
    return getViewportV2ImageDataSet<Volume3DRegisteredDataSet>(dataId);
  }

  private getActorEntriesForRendering(
    rendering: Volume3DRendering,
    data: LoadedData<Volume3DPayload>
  ): ActorEntry[] {
    if (
      rendering.renderMode === 'vtkVolume3d' &&
      data.renderMode === 'vtkVolume3d'
    ) {
      return [
        {
          actor: rendering.actor,
          referencedId: data.volumeId,
          uid: data.actorUID || data.volumeId,
        },
      ];
    }

    if (rendering.renderMode === 'vtkGeometry3d') {
      return rendering.actors;
    }

    return [];
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
