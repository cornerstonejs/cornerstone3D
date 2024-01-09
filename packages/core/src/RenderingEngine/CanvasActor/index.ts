import type { IViewport } from '../../types/IViewport';
import type { ICanvasActor } from '../../types/IActor';

export class CanvasProperties {
  private actor: CanvasActor;
  private opacity = 0.4;
  private outlineOpacity = 0.4;
  private transferFunction = [];

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  public setRGBTransferFunction(index, cfun) {
    this.transferFunction[index] = cfun;
  }

  public setScalarOpacity(opacity: number) {
    if (opacity > 0.05) {
      this.opacity = opacity;
    } else {
      this.opacity = 0.4;
    }
  }

  public setInterpolationTypeToNearest() {
    // No-op
  }

  public setUseLabelOutline() {
    // No-op
  }

  public setLabelOutlineOpacity(opacity) {
    this.outlineOpacity = opacity;
  }

  public setLabelOutlineThickness() {
    // No-op
  }

  public getColor(index: number) {
    const cfun = this.transferFunction[0];
    const r = cfun.getRedValue(index);
    const g = cfun.getGreenValue(index);
    const b = cfun.getBlueValue(index);
    const a = cfun.getAlpha();
    return `rgb(${r * 255},${g * 255},${b * 255},${a * this.opacity})`;
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
  protected className = 'CanvasActor';

  constructor(viewport: IViewport, image) {
    this.image = image;
    this.viewport = viewport;
  }

  public render(viewport: IViewport, context: CanvasRenderingContext2D): void {
    if (!this.visibility) {
      return;
    }
    context.fillStyle = '#ff000040';
    const { width, height } = this.image;
    const data = this.image.getPixelData();
    let offset = 0;
    const fillVLast = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = data[offset++];
        if (v) {
          if (v !== fillVLast) {
            const rgb = this.canvasProperties.getColor(v);
            context.fillStyle = this.canvasProperties.getColor(v);
          }
          context.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  public getClassName() {
    return this.className;
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
    return actorType === this.className;
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
      // No-op
    };
    return this.image;
  }
}
