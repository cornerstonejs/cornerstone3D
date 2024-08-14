import type IStackViewport from './IStackViewport';
import type { PublicViewportInput } from './IViewport';
import type IVolumeViewport from './IVolumeViewport';
import type { IViewport } from './IViewport';

export default interface IRenderingEngine {
  id: string;
  hasBeenDestroyed: boolean;
  offscreenMultiRenderWindow: any;
  offScreenCanvasContainer: any;
  setViewports(viewports: PublicViewportInput[]): void;
  resize(immediate?: boolean, keepCamera?: boolean): void;
  getViewport(id: string): IViewport;
  getViewports(): IViewport[];
  render(): void;
  renderViewports(viewportIds: string[]): void;
  renderViewport(viewportId: string): void;
  renderFrameOfReference(FrameOfReferenceUID: string): void;
  fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ): void;
  enableElement(viewportInputEntry: PublicViewportInput): void;
  disableElement(viewportId: string): void;
  getStackViewports(): IStackViewport[];
  getVolumeViewports(): IVolumeViewport[];
  getStackViewport(id: string): IStackViewport;
  destroy(): void;
  _debugRender(): void;
}
