import type IStackViewport from './IStackViewport';
import type { PublicViewportInput } from './IViewport';
import type IVolumeViewport from './IVolumeViewport';
import type { IViewport } from './IViewport';

export default interface IRenderingEngine {
  id: string;
  hasBeenDestroyed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offscreenMultiRenderWindow: any;
  offScreenCanvasContainer: HTMLDivElement;
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
