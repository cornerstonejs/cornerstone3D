import type { IViewport } from '../../types/IViewport';

import CanvasProperties, { getCanvasLabelOutline } from './CanvasProperties';
import CanvasMapper from './CanvasMapper';
import {
  composeCanvasLabelmapLayer,
  drawCanvasLabelmapLayer,
  findLabelBounds,
  hasOutlineAtImageEdges,
} from './canvasLabelmapLayer';
import type {
  CanvasLabelBounds,
  CanvasLabelmapLayer,
} from './canvasLabelmapLayer';

/**
 * Handles canvas rendering of derived image data, typically label maps.
 * This class draws a derived image, a standard Cornerstone labelmap or an
 * RLE based one, on the canvas of a viewport, as the GPU image mapper draws
 * a labelmap: in the pixels of the canvas, through the transform of the
 * context from the pixels of the image, with the outline of its properties
 * (`canvasLabelmapLayer`). The labelmaps drawn on one canvas in one render
 * pass are composed as the GPU composes them, whatever their order.
 */
export default class CanvasActor {
  private image;
  private derivedImage;
  private canvasProperties = new CanvasProperties(this);
  private visibility = false;
  private mapper = new CanvasMapper(this);
  private viewport;
  private rasterDirty = true;
  private runLabels?: Int32Array;
  private labelBounds?: CanvasLabelBounds;
  private layer?: CanvasLabelmapLayer;
  private layerKey?: string;
  protected className = 'CanvasActor';
  protected canvas;

  constructor(viewport: IViewport, derivedImage) {
    this.derivedImage = derivedImage;
    this.viewport = viewport;
  }

  /**
   * Renders an RLE representation of the viewport data. The runs are written
   * into one label per pixel when the data changed, and drawn as a dense
   * labelmap.
   */
  protected renderRLE(viewport, context, voxelManager) {
    const { width, height } = this.image;

    if (
      this.rasterDirty ||
      !this.runLabels ||
      this.runLabels.length !== width * height
    ) {
      const labels =
        this.runLabels?.length === width * height
          ? this.runLabels
          : new Int32Array(width * height);
      const { map } = voxelManager;

      labels.fill(0);

      for (let y = 0; y < height; y++) {
        const row = map.getRun(y, 0);

        if (!row) {
          continue;
        }

        for (const { start, end, value } of row) {
          labels.fill(value, y * width + start, y * width + end);
        }
      }

      this.runLabels = labels;
    }

    this.drawLabels(context, this.runLabels, width, height);
  }

  /**
   * Draws labels on the canvas of the context. The layer of the canvas
   * pixels is made again when the data, the colours, the outline, the
   * transform or the canvas size changed, else the last one is composed.
   */
  private drawLabels(
    context: CanvasRenderingContext2D,
    labels: ArrayLike<number>,
    width: number,
    height: number
  ): void {
    const transform = context.getTransform();
    const { canvas } = context;
    const outlineAtImageEdges = hasOutlineAtImageEdges(this);
    const layerKey = [
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e,
      transform.f,
      canvas.width,
      canvas.height,
      width,
      height,
      outlineAtImageEdges,
    ].join(',');

    if (this.rasterDirty || !this.layer || layerKey !== this.layerKey) {
      if (this.rasterDirty || !this.layer) {
        this.labelBounds = findLabelBounds(labels, width, height);
      }

      this.layer = drawCanvasLabelmapLayer(
        {
          labels,
          width,
          height,
          labelBounds: this.labelBounds,
          getColor: (label) => this.canvasProperties.getColorBytes(label),
          outline: getCanvasLabelOutline(this.canvasProperties),
          outlineAtImageEdges,
        },
        transform,
        canvas.width,
        canvas.height,
        this.layer
      );
      this.layerKey = layerKey;
      this.canvas = this.layer.canvas;
      this.rasterDirty = false;
    }

    composeCanvasLabelmapLayer(context, this.layer, context.globalAlpha);
  }

  public setMapper(mapper: CanvasMapper) {
    this.mapper = mapper;
  }

  /**
   * Draws the labelmap on the canvas of the context, placed by the transform
   * of the context from the pixels of the image to the pixels of the canvas,
   * with the opacity of the context.
   */
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

    this.drawLabels(context, data, width, height);
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
      getOrigin: () => imageData.origin,
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
