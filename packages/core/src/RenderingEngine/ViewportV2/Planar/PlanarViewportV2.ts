import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import { OrientationAxis } from '../../../enums';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { CpuImageCanvasPath } from './CpuImageCanvasRenderingAdapter';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderingAdapter';
import { VtkVolumeMapperPath } from './VtkVolumeMapperRenderingAdapter';
import type {
  PlanarDataProvider,
  PlanarPresentationProps,
  PlanarRenderMode,
  PlanarRendering,
  PlanarStackPayload,
  PlanarStackSetOptions,
  PlanarViewportBackendContext,
  PlanarViewportV2Input,
  PlanarViewState,
} from './PlanarViewportV2Types';

defaultRenderPathResolver.register(new CpuImageCanvasPath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeMapperPath());

class PlanarViewportV2 extends ViewportV2<
  PlanarViewState,
  PlanarPresentationProps
> {
  readonly kind = 'planar' as const;
  readonly id: string;
  readonly element: HTMLDivElement;

  protected backendContext: PlanarViewportBackendContext;

  private activeDataId?: string;

  constructor(args: PlanarViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;

    const genericRenderWindow = vtkGenericRenderWindow.newInstance({
      background: args.background || [0, 0, 0],
    });
    genericRenderWindow.setContainer(this.element);
    const renderer = genericRenderWindow.getRenderer();
    const renderWindow = genericRenderWindow.getRenderWindow();
    const vtkCanvas = this.element.querySelector('canvas');

    if (!(vtkCanvas instanceof HTMLCanvasElement)) {
      throw new Error('[PlanarViewportV2] Failed to initialize VTK canvas');
    }

    const cpuCanvas = document.createElement('canvas');
    cpuCanvas.style.display = 'none';
    cpuCanvas.style.height = '100%';
    cpuCanvas.style.inset = '0';
    cpuCanvas.style.position = 'absolute';
    cpuCanvas.style.width = '100%';
    this.element.appendChild(cpuCanvas);

    const cpuCanvasContext = cpuCanvas.getContext('2d');

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewportV2] Failed to initialize CPU canvas');
    }

    renderer.getActiveCamera().setParallelProjection(true);

    this.backendContext = {
      viewportId: this.id,
      viewportKind: 'planar',
      canvas: cpuCanvas,
      canvasContext: cpuCanvasContext,
      cpuCanvas,
      cpuCanvasContext,
      element: this.element,
      genericRenderWindow,
      requestRender: () => {
        this.render();
      },
      renderer,
      renderWindow,
      setRenderMode: (renderMode: PlanarRenderMode) => {
        const useCPUCanvas = renderMode === 'cpu2d';
        cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
        vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
      },
      setRenderModeVisibility: (renderMode: PlanarRenderMode) => {
        const useCPUCanvas = renderMode === 'cpu2d';
        cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
        vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
      },
      vtkCanvas,
    };
    this.viewState = {
      imageIdIndex: 0,
      orientation: OrientationAxis.AXIAL,
      zoom: 1,
      pan: [0, 0],
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.resize();
  }

  async setStack(
    imageIds: string[],
    options: PlanarStackSetOptions = {}
  ): Promise<string> {
    const dataId = options.dataId || imageIds[0];
    const initialImageIdIndex = Math.min(
      Math.max(0, options.initialImageIdIndex ?? 0),
      imageIds.length - 1
    );
    const renderMode: PlanarRenderMode = options.renderMode || 'vtkImage';
    const dataProvider = this.dataProvider as PlanarDataProvider;

    dataProvider.register(dataId, {
      imageIds,
      initialImageIdIndex,
      volumeId: options.volumeId,
    });
    this.activeDataId = dataId;
    this.viewState = {
      ...this.viewState,
      imageIdIndex: initialImageIdIndex,
    };

    const renderingId = await this.setDataId(dataId, {
      role: 'image',
      renderMode,
    });

    this.setPresentation(dataId, {
      visible: true,
      opacity: 1,
    });

    return renderingId;
  }

  getImageIds(): string[] {
    return this.getPayload()?.imageIds || [];
  }

  getCurrentImageIdIndex(): number {
    return this.viewState.imageIdIndex ?? 0;
  }

  getCurrentImageId(): string | undefined {
    return this.getImageIds()[this.getCurrentImageIdIndex()];
  }

  setProperties(props: PlanarPresentationProps): void {
    if (!this.activeDataId) {
      return;
    }

    this.setPresentation(this.activeDataId, {
      ...(this.getPresentation(this.activeDataId) || {}),
      ...props,
    });
  }

  getProperties(): PlanarPresentationProps | undefined {
    if (!this.activeDataId) {
      return;
    }

    return this.getPresentation(this.activeDataId);
  }

  setImageIdIndex(imageIdIndex: number): Promise<string> {
    const imageIds = this.getImageIds();

    if (!imageIds.length) {
      return Promise.reject(
        new Error('[PlanarViewportV2] Cannot set image index on empty stack')
      );
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, imageIdIndex),
      imageIds.length - 1
    );

    this.setViewState({
      imageIdIndex: clampedImageIdIndex,
    });

    return Promise.resolve(imageIds[clampedImageIdIndex]);
  }

  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getCurrentImageIdIndex() + delta);
  }

  setOrientation(
    orientation:
      | OrientationAxis.AXIAL
      | OrientationAxis.CORONAL
      | OrientationAxis.SAGITTAL
  ): void {
    this.setViewState({ orientation });
  }

  resize(): void {
    this.backendContext.genericRenderWindow.resize();

    const { clientHeight, clientWidth } = this.element;
    const { cpuCanvas } = this.backendContext;

    if (cpuCanvas.width !== clientWidth || cpuCanvas.height !== clientHeight) {
      cpuCanvas.width = clientWidth;
      cpuCanvas.height = clientHeight;
    }

    for (const binding of this.bindings.values()) {
      binding.adapter.resize?.(
        this.backendContext,
        binding.rendering as PlanarRendering
      );
    }
  }

  render(): void {
    let renderedByAdapter = false;

    for (const binding of this.bindings.values()) {
      binding.adapter.render?.(
        this.backendContext,
        binding.rendering as PlanarRendering
      );
      renderedByAdapter = renderedByAdapter || Boolean(binding.adapter.render);
    }

    if (!renderedByAdapter) {
      this.backendContext.renderWindow.render();
    }
  }

  private getPayload(): PlanarStackPayload | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as PlanarRendering).backendHandle.payload;
  }
}

export default PlanarViewportV2;
