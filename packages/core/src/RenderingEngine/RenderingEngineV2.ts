import ContextPoolRenderingEngineV2 from './ContextPoolRenderingEngineV2';
import type {
  IStackViewport,
  IVolumeViewport,
  IViewport,
  PublicViewportInput,
  VtkOffscreenMultiRenderWindow,
} from '../types';

class RenderingEngineV2 {
  public hasBeenDestroyed: boolean;
  public offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow;
  private _implementation: ContextPoolRenderingEngineV2;

  constructor(id?: string) {
    this._implementation = new ContextPoolRenderingEngineV2(id);
  }

  get id(): string {
    return this._implementation.id;
  }

  public enableViewport(viewportInputEntry: PublicViewportInput): void {
    this._implementation.enableViewport(viewportInputEntry);
  }

  public disableViewport(viewportId: string): void {
    this._implementation.disableViewport(viewportId);
  }

  public enableElement(viewportInputEntry: PublicViewportInput): void {
    this._implementation.enableElement(viewportInputEntry);
  }

  public disableElement(viewportId: string): void {
    this._implementation.disableElement(viewportId);
  }

  public setViewports(publicViewportInputEntries: PublicViewportInput[]): void {
    this._implementation.setViewports(publicViewportInputEntries);
  }

  public resize(immediate = true, keepCamera = true): void {
    this._implementation.resize(immediate, keepCamera);
  }

  public getViewport(viewportId: string): IViewport {
    return this._implementation.getViewport(viewportId);
  }

  public getViewports(): IViewport[] {
    return this._implementation.getViewports();
  }

  public getStackViewport(viewportId: string): IStackViewport {
    return this._implementation.getStackViewport(viewportId);
  }

  public getStackViewports(): IStackViewport[] {
    return this._implementation.getStackViewports();
  }

  public getVolumeViewports(): IVolumeViewport[] {
    return this._implementation.getVolumeViewports();
  }

  public getRenderer(viewportId: string) {
    return this._implementation.getRenderer(viewportId);
  }

  public fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ) {
    this._implementation.fillCanvasWithBackgroundColor(canvas, backgroundColor);
  }

  public render(): void {
    this._implementation.render();
  }

  public renderViewports(viewportIds: string[]): void {
    this._implementation.renderViewports(viewportIds);
  }

  public renderViewport(viewportId: string): void {
    this._implementation.renderViewport(viewportId);
  }

  public destroy(): void {
    this._implementation.destroy();
  }

  public getOffscreenMultiRenderWindow(
    viewportId?: string
  ): VtkOffscreenMultiRenderWindow {
    return this._implementation.getOffscreenMultiRenderWindow(viewportId);
  }
}

export default RenderingEngineV2;
