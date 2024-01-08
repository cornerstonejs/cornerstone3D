import type { IViewport } from '../../types/IViewport';
import type { ICanvasActor } from '../../types/IActor';

export class CanvasProperties {
  private actor: CanvasActor;
  private opacity = 0.8;

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  public setRGBTransferFunction() {
    // No-op right now
    console.log('Set RGB transfer function');
  }

  public setScalarOpacity(opacity: number) {
    this.opacity = opacity;
  }

  public setInterpolationTypeToNearest() {
    // No-op
  }

  public setUseLabelOutline() {
    // No-op
  }

  public setLabelOutlineOpacity() {
    // No-op
  }

  public setLabelOutlineThickness() {
    // No-op
  }
}

/**
 * Handles canvas rendering of image data.
 */
export default class CanvasActor implements ICanvasActor {
  private image;
  private canvasProperties = new CanvasProperties(this);
  private visibility = false;

  constructor(image) {
    this.image = image;
  }

  public render(viewport: IViewport, context: CanvasRenderingContext2D): void {
    if (!this.visibility) {
      return;
    }
    console.log('Rendering canvas actor', viewport);
    context.fillStyle = 'red';
    context.fillRect(25, 25, 50, 50);
  }

  public getProperty() {
    return this.canvasProperties;
  }

  public setVisibility(visibility: boolean) {
    this.visibility = visibility;
  }

  public getMapper() {
    return null;
  }
}
