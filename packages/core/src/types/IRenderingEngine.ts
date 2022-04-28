import IStackViewport from './IStackViewport';
import { PublicViewportInput } from './IViewport';
import IVolumeViewport from './IVolumeViewport';

export default interface IRenderingEngine {
  id: string;
  hasBeenDestroyed: boolean;
  offscreenMultiRenderWindow: any;
  offScreenCanvasContainer: any;
  setViewports(viewports: Array<PublicViewportInput>): void;
  resize(immediate?: boolean, resetPan?: boolean, resetZoom?: boolean): void;
  getViewport(id: string): IStackViewport | IVolumeViewport;
  getViewports(): Array<IStackViewport | IVolumeViewport>;
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
