import { getConfiguration } from '../init';
import StandardRenderingEngine from './StandardRenderingEngine';
import SequentialRenderingEngine from './SequentialRenderingEngine';
import type BaseRenderingEngine from './BaseRenderingEngine';
import type {
  IStackViewport,
  IVolumeViewport,
  IViewport,
  PublicViewportInput,
} from '../types';
import { RenderingEngineModeEnum } from '../enums';

class RenderingEngine {
  public hasBeenDestroyed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public offscreenMultiRenderWindow: any;
  private _implementation?: BaseRenderingEngine;

  constructor(id?: string) {
    const config = getConfiguration();
    const renderingEngineMode = config?.rendering?.renderingEngineMode;

    switch (renderingEngineMode) {
      case RenderingEngineModeEnum.Standard:
        this._implementation = new StandardRenderingEngine(id);
        break;
      case RenderingEngineModeEnum.Next:
        this._implementation = new SequentialRenderingEngine(id);
        break;
      default:
        console.warn(
          `RenderingEngine: Unknown rendering engine mode "${renderingEngineMode}". Defaulting to Next rendering engine.`
        );
        this._implementation = new SequentialRenderingEngine(id);
        break;
    }
  }

  get id(): string {
    return this._implementation.id;
  }

  public enableElement(viewportInputEntry: PublicViewportInput): void {
    return this._implementation.enableElement(viewportInputEntry);
  }

  public disableElement(viewportId: string): void {
    return this._implementation.disableElement(viewportId);
  }

  public setViewports(publicViewportInputEntries: PublicViewportInput[]): void {
    return this._implementation.setViewports(publicViewportInputEntries);
  }

  public resize(immediate = true, keepCamera = true): void {
    return this._implementation.resize(immediate, keepCamera);
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
  public fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ) {
    return this._implementation.fillCanvasWithBackgroundColor(
      canvas,
      backgroundColor
    );
  }

  public render(): void {
    return this._implementation.render();
  }

  public renderViewports(viewportIds: string[]): void {
    return this._implementation.renderViewports(viewportIds);
  }

  public renderViewport(viewportId: string): void {
    return this._implementation.renderViewport(viewportId);
  }

  public destroy(): void {
    return this._implementation.destroy();
  }
}

export default RenderingEngine;
