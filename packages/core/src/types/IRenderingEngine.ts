import IStackViewport from './IStackViewport';
import { PublicViewportInput } from './IViewport';
import IVolumeViewport from './IVolumeViewport';
import { IViewport } from './IViewport';

export default interface IRenderingEngine {
  id: string;
  hasBeenDestroyed: boolean;
  offscreenMultiRenderWindow: any;
  offScreenCanvasContainer: any;
  setViewports(viewports: Array<PublicViewportInput>): void;
  resize(immediate?: boolean, keepCamera?: boolean): void;
  getViewport(id: string): IViewport;
  getViewports(): Array<IViewport>;
  render(): void;
  renderViewports(viewportIds: Array<string>): void;
  renderViewport(viewportId: string): void;
  renderFrameOfReference(FrameOfReferenceUID: string): void;
  fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ): void;
  enableElement(viewportInputEntry: PublicViewportInput): void;
  disableElement(viewportId: string): void;
  getStackViewports(): Array<IStackViewport>;
  getVolumeViewports(): Array<IVolumeViewport>;
  destroy(): void;
  _debugRender(): void;
}
