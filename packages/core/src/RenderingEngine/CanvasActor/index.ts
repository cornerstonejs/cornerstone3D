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
    return [r, g, b, a];
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
  private derivedImage;
  private canvasProperties = new CanvasProperties(this);
  private visibility = false;
  private mapper = new CanvasMapper(this);
  private viewport;
  protected className = 'CanvasActor';
  protected canvas;

  constructor(viewport: IViewport, derivedImage) {
    this.derivedImage = derivedImage;
    this.viewport = viewport;
  }

  /**
   * Renders an RLE representation of the viewport data.  This is optimized to
   * use avoid iteration where possible.
   */
  protected renderRLE(viewport, context, voxelManager) {
    const { width, height } = this.image;
    let { canvas } = this;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      this.canvas = canvas = new window.OffscreenCanvas(width, height);
    }
    const localContext = canvas.getContext('2d');
    const imageData = localContext.createImageData(width, height);
    const { data: imageArray } = imageData;
    imageArray.fill(0);
    const { map } = voxelManager;
    let dirtyX = Infinity;
    let dirtyY = Infinity;
    let dirtyX2 = -Infinity;
    let dirtyY2 = -Infinity;
    for (let y = 0; y < height; y++) {
      const row = map.getRun(y, 0);
      if (!row) {
        continue;
      }
      dirtyY = Math.min(dirtyY, y);
      dirtyY2 = Math.max(dirtyY2, y);
      const baseOffset = y * width * 4;
      for (const run of row) {
        const { i: iStart, iEnd, value } = run;
        dirtyX = Math.min(dirtyX, iStart);
        dirtyX2 = Math.max(dirtyX2, iEnd);
        const rgb = this.canvasProperties.getColor(value).map((v) => v * 255);
        let startOffset = baseOffset + run.i * 4;

        for (let i = iStart; i < iEnd; i++) {
          imageArray[startOffset++] = rgb[0];
          imageArray[startOffset++] = rgb[1];
          imageArray[startOffset++] = rgb[2];
          imageArray[startOffset++] = rgb[3];
        }
      }
    }

    if (dirtyX > width) {
      return;
    }
    const dirtyWidth = dirtyX2 - dirtyX;
    const dirtyHeight = dirtyY2 - dirtyY;
    localContext.putImageData(
      imageData,
      0,
      0,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight
    );
    context.drawImage(
      canvas,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight
    );
  }

  public render(viewport: IViewport, context: CanvasRenderingContext2D): void {
    if (!this.visibility) {
      return;
    }
    const image = this.image || this.getImage();

    const { width, height } = image;

    const data = image.getScalarData();
    if (!data) {
      return;
    }
    const { voxelManager } = image;
    if (voxelManager) {
      if (voxelManager.map.getRun) {
        return this.renderRLE(viewport, context, voxelManager);
      }
    }
    let { canvas } = this;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      this.canvas = canvas = new window.OffscreenCanvas(width, height);
    }
    const localContext = canvas.getContext('2d');
    const imageData = localContext.createImageData(width, height);
    const { data: imageArray } = imageData;
    let offset = 0;
    let destOffset = 0;
    let dirtyX = Infinity;
    let dirtyY = Infinity;
    let dirtyX2 = -Infinity;
    let dirtyY2 = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // const destOffset = (x + y * width) * 4;
        const v = data[offset++];
        if (v) {
          dirtyX = Math.min(x, dirtyX);
          dirtyY = Math.min(y, dirtyY);
          dirtyX2 = Math.max(x, dirtyX2);
          dirtyY2 = Math.max(y, dirtyY2);
          const rgb = this.canvasProperties.getColor(v);
          imageArray[destOffset] = rgb[0] * 255;
          imageArray[destOffset + 1] = rgb[1] * 255;
          imageArray[destOffset + 2] = rgb[2] * 255;
          imageArray[destOffset + 3] = 127;
          // imageArray.fill(55, offset, offset + 4);
        }
        destOffset += 4;
      }
    }

    if (dirtyX > width) {
      return;
    }
    const dirtyWidth = dirtyX2 - dirtyX + 1;
    const dirtyHeight = dirtyY2 - dirtyY + 1;
    localContext.putImageData(
      imageData,
      0,
      0,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight
    );
    context.drawImage(
      canvas,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight
    );
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
    if (this.image) {
      return this.image;
    }
    this.image = { ...this.derivedImage };
    const imageData = this.viewport.getImageData();
    this.image.worldToIndex = (worldPos) =>
      imageData.imageData.worldToIndex(worldPos);
    this.image.indexToWorld = (index) =>
      imageData.imageData.indexToWorld(index);
    this.image.getDimensions = () => imageData.dimensions;
    this.image.getScalarData = () => this.derivedImage?.getPixelData();
    this.image.getDirection = () => imageData.direction;
    this.image.getSpacing = () => imageData.spacing;
    this.image.setOrigin = () => null;
    this.image.setDerivedImage = (image) => {
      this.derivedImage = image;
      this.image = null;
    };
    this.image.modified = () => {
      this.image = null;
    };
    return this.image;
  }
}
