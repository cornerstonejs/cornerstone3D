import type { IViewport } from '../../types/IViewport';

import CanvasProperties from './CanvasProperties';
import CanvasMapper from './CanvasMapper';

/**
 * Handles canvas rendering of derived image data, typically label maps.
 * This class will update the canvas from the given viewport with a
 * derived image.  The derived image can be a standard Cornerstone labelmap
 * or be an RLE based one.  The RLE based ones are significantly faster to
 * render as they only render the area actually relevant.
 */
export default class CanvasActor {
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

  public setMapper(mapper: CanvasMapper) {
    this.mapper = mapper;
  }

  public render(viewport: IViewport, context: CanvasRenderingContext2D): void {
    if (!this.visibility) {
      return;
    }
    const image = this.image || this.getImage();

    const { width, height } = this.getCanvasSizeForImage(image);

    if (!width || !height) {
      return;
    }

    const data = image.getScalarData();
    if (!data) {
      return;
    }
    const { voxelManager } = image;
    if (voxelManager) {
      if (voxelManager.map?.getRun) {
        this.renderRLE(viewport, context, voxelManager);
        return;
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
        const segmentIndex = data[offset++];
        if (segmentIndex) {
          dirtyX = Math.min(x, dirtyX);
          dirtyY = Math.min(y, dirtyY);
          dirtyX2 = Math.max(x, dirtyX2);
          dirtyY2 = Math.max(y, dirtyY2);
          const rgb = this.canvasProperties.getColor(segmentIndex);
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
    const getDerivedScalarData = () => {
      if (this.derivedImage?.getPixelData) {
        return this.derivedImage.getPixelData();
      }

      return this.derivedImage?.getPointData?.()?.getScalars?.()?.getData?.();
    };

    const imageData = this.viewport.getImageData();
    const derivedDimensions = this.derivedImage?.getDimensions?.();
    const fallbackDimensions = imageData?.dimensions ?? [0, 0, 1];
    const dimensions = derivedDimensions ?? fallbackDimensions;
    const width =
      this.derivedImage?.width ??
      this.derivedImage?.columns ??
      dimensions?.[0] ??
      fallbackDimensions?.[0];
    const height =
      this.derivedImage?.height ??
      this.derivedImage?.rows ??
      dimensions?.[1] ??
      fallbackDimensions?.[1];

    Object.assign(this.image, {
      width: CanvasActor.toValidCanvasSize(width),
      height: CanvasActor.toValidCanvasSize(height),
      worldToIndex: (worldPos) => imageData.imageData.worldToIndex(worldPos),
      indexToWorld: (index, destPoint) =>
        imageData.imageData.indexToWorld(index, destPoint),
      getDimensions: () => dimensions,
      getScalarData: () => getDerivedScalarData(),
      getDirection: () => imageData.direction,
      getSpacing: () => imageData.spacing,
      setOrigin: () => null,
      /**
       * Stores the new image cache data to update the image object, and sets
       * the image instance (this object) to null so that the next getImage
       * refreshes the display.
       */
      setDerivedImage: (image: unknown) => this.setDerivedImage(image),
      modified: () => null,
    });
    return this.image;
  }

  public setDerivedImage(image: unknown) {
    this.derivedImage = image;
    this.image = null;
  }

  public modified() {
    this.image = null;
  }

  /**
   * Renders an RLE representation of the viewport data.  This is optimized to
   * avoid iterating over any data not actually containing data.
   */
  protected renderRLE(viewport, context, voxelManager) {
    const { width, height } = this.getCanvasSizeForImage(this.image);

    if (!width || !height) {
      return;
    }

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
      const baseOffset = (y * width) << 2;
      let indicesToDelete;
      for (const run of row) {
        const { start, end, value: segmentIndex } = run;
        if (segmentIndex === 0) {
          indicesToDelete ||= [];
          indicesToDelete.push(row.indexOf(run));
          continue;
        }
        dirtyX = Math.min(dirtyX, start);
        dirtyX2 = Math.max(dirtyX2, end);
        const rgb = this.canvasProperties
          .getColor(segmentIndex)
          .map((v) => v * 255);
        let startOffset = baseOffset + (start << 2);

        for (let i = start; i < end; i++) {
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
      dirtyX - 1,
      dirtyY - 1,
      dirtyWidth + 2,
      dirtyHeight + 2
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

  private getCanvasSizeForImage(image): { width: number; height: number } {
    const dimensions =
      image?.getDimensions?.() ?? this.derivedImage?.getDimensions?.();
    const width =
      image?.width ?? image?.columns ?? dimensions?.[0] ?? image?.rows;
    const height =
      image?.height ?? image?.rows ?? dimensions?.[1] ?? image?.columns;

    return {
      width: CanvasActor.toValidCanvasSize(width),
      height: CanvasActor.toValidCanvasSize(height),
    };
  }

  private static toValidCanvasSize(value: unknown): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }

    return Math.trunc(numeric);
  }
}
