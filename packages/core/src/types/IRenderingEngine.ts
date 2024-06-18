import IStackViewport from './IStackViewport.js';
import { PublicViewportInput } from './IViewport.js';
import IVolumeViewport from './IVolumeViewport.js';
import { IViewport } from './IViewport.js';
import IVideoViewport from './IVideoViewport.js';

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
  getVideoViewports(): Array<IVideoViewport>;
  destroy(): void;
  _debugRender(): void;
}
