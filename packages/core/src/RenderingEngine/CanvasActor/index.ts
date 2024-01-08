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

export class CanvasMapper {
  private actor: CanvasActor;

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  getInputData() {
    return this.actor.getImage();
  }
}

/**
 * Handles canvas rendering of image data.
 */
export default class CanvasActor implements ICanvasActor {
  private image;
  private canvasProperties = new CanvasProperties(this);
  private visibility = false;
  private mapper = new CanvasMapper(this);
  private viewport;

  constructor(viewport: IViewport, image) {
    this.image = image;
    this.viewport = viewport;
  }

  public render(viewport: IViewport, context: CanvasRenderingContext2D): void {
    if (!this.visibility) {
      return;
    }
    console.log('Rendering canvas actor', viewport, this.image);
    context.fillStyle = 'red';
    context.fillRect(25, 25, 50, 50);
  }

  public getClassName() {
    return 'CanvasActor';
  }

  public getProperty() {
    return this.canvasProperties;
  }

  public setVisibility(visibility: boolean) {
    this.visibility = visibility;
  }

  public getMapper() {
    return this.mapper;
  }

  public isA(actorType) {
    console.log('Testing if this is a', actorType);
    return false;
  }

  public getImage() {
    const imageData = this.viewport.getImageData();
    this.image.worldToIndex = (worldPos) =>
      imageData.imageData.worldToIndex(worldPos);
    this.image.indexToWorld = (index) =>
      imageData.imageData.indexToWorld(index);
    this.image.getDimensions = () => imageData.dimensions;
    this.image.getScalarData = () => this.image.getPixelData();
    this.image.getDirection = () => imageData.direction;
    this.image.getSpacing = () => imageData.spacing;
    this.image.modified = () => {
      console.log('Modified segdata');
    };
    console.log('imageData=', imageData, this.image);
    return this.image;
  }
}
