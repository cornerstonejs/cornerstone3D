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
  private rasterDirty = true;
  private hasCachedRaster = false;
  private cachedImageData?: ImageData;
  protected className = 'CanvasActor';
  protected canvas;

  constructor(viewport: IViewport, derivedImage) {
    this.derivedImage = derivedImage;
    this.viewport = viewport;
  }

  /**
   * Renders an RLE representation of the viewport data.  This is optimized to
   * avoid iterating over any data not actually containing data.
   */
  protected renderRLE(viewport, context, voxelManager) {
    const { width, height } = this.image;
    let { canvas } = this;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      this.canvas = canvas = new window.OffscreenCanvas(width, height);
      this.cachedImageData = undefined;
      this.rasterDirty = true;
    }

    if (!this.rasterDirty) {
      if (this.hasCachedRaster) {
        context.drawImage(canvas, 0, 0);
      }

      return;
    }

    const localContext = canvas.getContext('2d');
    let imageData = this.cachedImageData;

    if (!imageData) {
      imageData = localContext.createImageData(width, height);
      this.cachedImageData = imageData;
    }

    const { data: imageArray } = imageData;
    imageArray.fill(0);
    const { map } = voxelManager;
    let hasVisiblePixels = false;

    for (let y = 0; y < height; y++) {
      const row = map.getRun(y, 0);
      if (!row) {
        continue;
      }

      const baseOffset = (y * width) << 2;
      for (const run of row) {
        const { start, end, value: segmentIndex } = run;
        if (segmentIndex === 0) {
          continue;
        }

        hasVisiblePixels = true;
        const rgba = this.canvasProperties.getColorBytes(segmentIndex);
        let startOffset = baseOffset + (start << 2);

        for (let i = start; i < end; i++) {
          imageArray[startOffset++] = rgba[0];
          imageArray[startOffset++] = rgba[1];
          imageArray[startOffset++] = rgba[2];
          imageArray[startOffset++] = rgba[3];
        }
      }
    }

    if (!hasVisiblePixels) {
      localContext.clearRect(0, 0, width, height);
      this.hasCachedRaster = false;
      this.rasterDirty = false;
      return;
    }

    localContext.putImageData(imageData, 0, 0);
    this.hasCachedRaster = true;
    this.rasterDirty = false;
    context.drawImage(canvas, 0, 0);
  }

  public setMapper(mapper: CanvasMapper) {
    this.mapper = mapper;
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
    if (voxelManager?.map?.getRun) {
      this.renderRLE(viewport, context, voxelManager);
      return;
    }
    let { canvas } = this;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      this.canvas = canvas = new window.OffscreenCanvas(width, height);
      this.cachedImageData = undefined;
      this.rasterDirty = true;
    }

    if (!this.rasterDirty) {
      if (this.hasCachedRaster) {
        context.drawImage(canvas, 0, 0);
      }

      return;
    }

    const localContext = canvas.getContext('2d');
    let imageData = this.cachedImageData;

    if (!imageData) {
      imageData = localContext.createImageData(width, height);
      this.cachedImageData = imageData;
    }

    const { data: imageArray } = imageData;
    imageArray.fill(0);
    let offset = 0;
    let destOffset = 0;
    let hasVisiblePixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const segmentIndex = data[offset++];
        if (segmentIndex) {
          hasVisiblePixels = true;
          const rgba = this.canvasProperties.getColorBytes(segmentIndex);
          imageArray[destOffset] = rgba[0];
          imageArray[destOffset + 1] = rgba[1];
          imageArray[destOffset + 2] = rgba[2];
          imageArray[destOffset + 3] = rgba[3];
        }
        destOffset += 4;
      }
    }

    if (!hasVisiblePixels) {
      localContext.clearRect(0, 0, width, height);
      this.hasCachedRaster = false;
      this.rasterDirty = false;
      return;
    }

    localContext.putImageData(imageData, 0, 0);
    this.hasCachedRaster = true;
    this.rasterDirty = false;
    context.drawImage(canvas, 0, 0);
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

  public modified() {
    this.rasterDirty = true;
  }

  public getImage() {
    if (this.image) {
      return this.image;
    }
    this.image = { ...this.derivedImage };
    const imageData = this.viewport.getImageData();
    Object.assign(this.image, {
      worldToIndex: (worldPos) => imageData.imageData.worldToIndex(worldPos),
      indexToWorld: (index, destPoint) =>
        imageData.imageData.indexToWorld(index, destPoint),
      getDimensions: () => imageData.dimensions,
      getScalarData: () => this.derivedImage?.getPixelData(),
      getDirection: () => imageData.direction,
      getSpacing: () => imageData.spacing,
      setOrigin: () => null,
      /**
       * Stores the new image cache data to update the image object, and sets
       * the image instance (this object) to null so that the next getImage
       * refreshes the display.
       */
      setDerivedImage: (image) => {
        this.derivedImage = image;
        this.image = null;
        this.modified();
      },
      modified: () => null,
    });
    return this.image;
  }
}
