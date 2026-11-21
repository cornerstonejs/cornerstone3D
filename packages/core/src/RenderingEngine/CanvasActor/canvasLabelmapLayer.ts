import type { CanvasLabelOutline } from './CanvasProperties';

/** A rectangle of canvas pixels. */
type CanvasPixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * One labelmap drawn in the pixels of a canvas: the colour of each canvas
 * pixel that shows a segment, with the fill alpha of the segment or, on its
 * outline, the outline opacity.
 */
export type CanvasLabelmapLayer = {
  /** One RGBA per canvas pixel, not premultiplied. */
  imageData: ImageData;
  /**
   * The same pixels on a canvas of their own, for a layer drawn alone: a
   * canvas element where the browser has no `OffscreenCanvas`.
   */
  canvas: OffscreenCanvas | HTMLCanvasElement;
  /** The smallest rectangle that holds every drawn pixel, or undefined. */
  bounds?: CanvasPixelBounds;
};

/**
 * The pixels of a labelmap image that hold a label: the first column and row
 * and one past the last column and row.
 */
export type CanvasLabelBounds = [number, number, number, number];

/** What the drawing of a labelmap layer reads. */
export type CanvasLabelmapSource = {
  /** One label per pixel of the labelmap image, row by row. */
  labels: ArrayLike<number>;
  width: number;
  height: number;
  /** The pixels that hold a label (`findLabelBounds`), undefined for none. */
  labelBounds?: CanvasLabelBounds;
  /** The fill colour of a label: red, green, blue and alpha bytes. */
  getColor: (label: number) => ArrayLike<number>;
  outline: CanvasLabelOutline;
  /**
   * True when the edges of the image are faces of a volume, which get an
   * outline: a neighbour outside the image counts as another label. Else a
   * neighbour outside the image reads the nearest edge pixel.
   */
  outlineAtImageEdges: boolean;
};

/** The labelmap layers drawn on one canvas in the render pass on screen. */
type CanvasLabelmapComposition = {
  layerCount: number;
  firstLayer?: CanvasLabelmapLayer;
  firstAlpha: number;
  /**
   * Five numbers per canvas pixel over the layers so far: the sums of red,
   * green and blue weighted by alpha, the sum of the alphas, and the product
   * of one minus each alpha. Made when a second layer arrives.
   */
  sums?: Float32Array;
  sumsReady: boolean;
};

/** The pixels whose outline is checked beyond the canvas: at most 255. */
const MAX_OUTLINE_THICKNESS = 255;

const compositions = new WeakMap<object, CanvasLabelmapComposition>();
const actorsWithOutlineAtImageEdges = new WeakSet<object>();

let labelScratch = new Int32Array(0);
let insideScratch = new Uint8Array(0);
let leftScratch = new Uint16Array(0);
let rightScratch = new Uint16Array(0);

/**
 * Sets whether the labelmap of a canvas actor gets an outline at the edges of
 * its image, as the GPU draws a labelmap slice of a volume, whose edges are
 * faces of the volume. Off by default, as for the image of a stack.
 */
export function setOutlineAtImageEdges(actor: object, enabled: boolean): void {
  if (enabled) {
    actorsWithOutlineAtImageEdges.add(actor);
  } else {
    actorsWithOutlineAtImageEdges.delete(actor);
  }
}

/** Whether the labelmap of a canvas actor gets an outline at image edges. */
export function hasOutlineAtImageEdges(actor: object): boolean {
  return actorsWithOutlineAtImageEdges.has(actor);
}

/**
 * Forgets the labelmap layers composed on a canvas. The planar CPU draw step
 * calls it when it clears the canvas for a new render pass, so the first
 * labelmap of the pass composes alone.
 */
export function resetCanvasLabelmapComposition(canvas: object): void {
  const composition = compositions.get(canvas);

  if (!composition) {
    return;
  }

  composition.layerCount = 0;
  composition.firstLayer = undefined;
  composition.sumsReady = false;
}

function getOutlineThickness(outline: CanvasLabelOutline, label: number) {
  if (!outline.use) {
    return 0;
  }

  const { thickness } = outline;
  const value = thickness[label - 1] ?? thickness[0] ?? 0;

  return Math.min(MAX_OUTLINE_THICKNESS, Math.max(0, Math.trunc(value)));
}

function getOutlineAlpha(outline: CanvasLabelOutline, label: number): number {
  const { opacity } = outline;
  const value =
    typeof opacity === 'number' ? opacity : (opacity[label - 1] ?? opacity[0]);

  return Math.round(Math.min(Math.max(value ?? 1, 0), 1) * 255);
}

function getMaxOutlineThickness(outline: CanvasLabelOutline): number {
  if (!outline.use) {
    return 0;
  }

  let max = 0;

  for (let index = 0; index < outline.thickness.length; index++) {
    max = Math.max(max, getOutlineThickness(outline, index + 1));
  }

  return max;
}

function ensureScratch(length: number, withDistances: boolean): void {
  if (labelScratch.length < length) {
    labelScratch = new Int32Array(length);
    insideScratch = new Uint8Array(length);
  }

  if (withDistances && leftScratch.length < length) {
    leftScratch = new Uint16Array(length);
    rightScratch = new Uint16Array(length);
  }
}

function createLayer(width: number, height: number): CanvasLabelmapLayer {
  return {
    imageData: new ImageData(width, height),
    canvas:
      typeof OffscreenCanvas === 'undefined'
        ? Object.assign(document.createElement('canvas'), { width, height })
        : new OffscreenCanvas(width, height),
  };
}

/**
 * The pixels of a labelmap image that hold a label other than 0, or
 * undefined when none does.
 */
export function findLabelBounds(
  labels: ArrayLike<number>,
  width: number,
  height: number
): CanvasLabelBounds | undefined {
  let minColumn = width;
  let maxColumn = -1;
  let minRow = height;
  let maxRow = -1;

  for (let row = 0; row < height; row++) {
    const start = row * width;
    let first = -1;
    let last = -1;

    for (let column = 0; column < width; column++) {
      if (labels[start + column]) {
        first = column;
        break;
      }
    }

    if (first < 0) {
      continue;
    }

    for (let column = width - 1; column >= first; column--) {
      if (labels[start + column]) {
        last = column;
        break;
      }
    }

    minColumn = Math.min(minColumn, first);
    maxColumn = Math.max(maxColumn, last);
    minRow = Math.min(minRow, row);
    maxRow = row;
  }

  return maxRow < 0
    ? undefined
    : [minColumn, minRow, maxColumn + 1, maxRow + 1];
}

/**
 * The canvas pixels [x0, x1) x [y0, y1) that a rectangle of image pixels
 * covers under the transform, clipped to the canvas, or undefined when it
 * covers none.
 */
function getImageCanvasBounds(
  transform: DOMMatrixReadOnly,
  [u0, v0, u1, v1]: CanvasLabelBounds,
  canvasWidth: number,
  canvasHeight: number
): [number, number, number, number] | undefined {
  const { a, b, c, d, e, f } = transform;
  const corners = [
    [u0, v0],
    [u1, v0],
    [u0, v1],
    [u1, v1],
  ];
  const xs = corners.map(([u, v]) => a * u + c * v + e);
  const ys = corners.map(([u, v]) => b * u + d * v + f);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(canvasWidth, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(canvasHeight, Math.ceil(Math.max(...ys)));

  return x1 > x0 && y1 > y0 ? [x0, x1, y0, y1] : undefined;
}

/**
 * Reads the label under the centre of each canvas pixel of a rectangle into
 * the label scratch, with the nearest pixel of the image, as the GPU image
 * mapper samples a labelmap. A pixel outside the image is marked as such and
 * reads -1, or the nearest edge pixel when the image edges get no outline.
 */
function sampleLabels(
  source: CanvasLabelmapSource,
  transform: DOMMatrixReadOnly,
  left: number,
  top: number,
  columns: number,
  rows: number
): void {
  const { labels, width, height, outlineAtImageEdges } = source;
  const { a, b, c, d, e, f } = transform;
  const det = a * d - b * c;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;

  for (let row = 0; row < rows; row++) {
    const y = top + row + 0.5 - f;
    const x = left + 0.5 - e;
    let u = ia * x + ic * y;
    let v = ib * x + id * y;
    let index = row * columns;

    for (let column = 0; column < columns; column++, index++) {
      const iu = Math.floor(u);
      const iv = Math.floor(v);

      if (iu >= 0 && iu < width && iv >= 0 && iv < height) {
        labelScratch[index] = labels[iv * width + iu];
        insideScratch[index] = 1;
      } else {
        insideScratch[index] = 0;
        labelScratch[index] = outlineAtImageEdges
          ? -1
          : labels[
              Math.min(height - 1, Math.max(0, iv)) * width +
                Math.min(width - 1, Math.max(0, iu))
            ];
      }

      u += ia;
      v += ib;
    }
  }
}

/**
 * For each pixel of the label scratch, the distance along its row to the
 * nearest pixel of another label on the left and on the right, at most
 * `limit`.
 */
function measureRowDistances(
  columns: number,
  rows: number,
  limit: number
): void {
  for (let row = 0; row < rows; row++) {
    const start = row * columns;
    const end = start + columns;

    leftScratch[start] = limit;

    for (let index = start + 1; index < end; index++) {
      leftScratch[index] =
        labelScratch[index - 1] !== labelScratch[index]
          ? 1
          : Math.min(limit, leftScratch[index - 1] + 1);
    }

    rightScratch[end - 1] = limit;

    for (let index = end - 2; index >= start; index--) {
      rightScratch[index] =
        labelScratch[index + 1] !== labelScratch[index]
          ? 1
          : Math.min(limit, rightScratch[index + 1] + 1);
    }
  }
}

/**
 * Draws a labelmap in the pixels of a canvas as the label outline shader of
 * the GPU image mapper draws it (vtk.js `ImageMapper`, core
 * `vtkStreamingOpenGLImageMapper`): each canvas pixel shows the label under
 * its centre; a pixel of a label is on the outline when a canvas pixel in the
 * square of the outline thickness of that label around it shows another
 * label, and is then drawn with the outline opacity, else with the fill alpha
 * of the label. The thickness is in canvas pixels, whatever the zoom.
 *
 * @param source - The labels, their colours and the outline settings
 * @param transform - From the pixels of the labelmap image (pixel i, j covers
 *   [i, i + 1] x [j, j + 1]) to the pixels of the canvas
 * @param canvasWidth - The width of the canvas in pixels
 * @param canvasHeight - The height of the canvas in pixels
 * @param reuse - A layer of an earlier draw whose buffers are reused
 * @returns The layer
 */
export function drawCanvasLabelmapLayer(
  source: CanvasLabelmapSource,
  transform: DOMMatrixReadOnly,
  canvasWidth: number,
  canvasHeight: number,
  reuse?: CanvasLabelmapLayer
): CanvasLabelmapLayer {
  const layer =
    reuse?.imageData.width === canvasWidth &&
    reuse.imageData.height === canvasHeight
      ? reuse
      : createLayer(canvasWidth, canvasHeight);
  const pixels = layer.imageData.data;
  const { a, b, c, d } = transform;
  const covered =
    !!source.labelBounds &&
    Math.abs(a * d - b * c) > 1e-12 &&
    getImageCanvasBounds(
      transform,
      source.labelBounds,
      canvasWidth,
      canvasHeight
    );

  if (layer.bounds) {
    const { x, y, width, height } = layer.bounds;

    for (let row = y; row < y + height; row++) {
      pixels.fill(
        0,
        (row * canvasWidth + x) * 4,
        (row * canvasWidth + x + width) * 4
      );
    }
  }

  layer.bounds = undefined;

  if (!covered) {
    return layer;
  }

  const { outline, getColor } = source;
  const margin = getMaxOutlineThickness(outline);
  const [x0, x1, y0, y1] = covered;
  const left = x0 - margin;
  const top = y0 - margin;
  const columns = x1 - x0 + 2 * margin;
  const rows = y1 - y0 + 2 * margin;

  ensureScratch(columns * rows, margin > 0);
  sampleLabels(source, transform, left, top, columns, rows);

  if (margin > 0) {
    measureRowDistances(columns, rows, margin + 1);
  }

  let lastLabel = 0;
  let color: ArrayLike<number> = [0, 0, 0, 0];
  let thickness = 0;
  let outlineAlpha = 0;
  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = y0; y < y1; y++) {
    let index = (y - top) * columns + (x0 - left);
    let offset = (y * canvasWidth + x0) * 4;

    for (let x = x0; x < x1; x++, index++, offset += 4) {
      const label = labelScratch[index];

      if (!insideScratch[index] || label <= 0) {
        continue;
      }

      if (label !== lastLabel) {
        lastLabel = label;
        color = getColor(label);
        thickness = getOutlineThickness(outline, label);
        outlineAlpha = getOutlineAlpha(outline, label);
      }

      let onOutline = false;

      for (
        let step = -thickness;
        thickness > 0 && step <= thickness && !onOutline;
        step++
      ) {
        const neighbour = index + step * columns;

        onOutline =
          labelScratch[neighbour] !== label ||
          leftScratch[neighbour] <= thickness ||
          rightScratch[neighbour] <= thickness;
      }

      const alpha = onOutline ? outlineAlpha : color[3];

      if (!alpha) {
        continue;
      }

      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = alpha;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX) {
    return layer;
  }

  layer.bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  const context = layer.canvas.getContext('2d');
  const { x, y, width, height } = layer.bounds;

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.putImageData(layer.imageData, 0, 0, x, y, width, height);

  return layer;
}

function getComposition(canvas: object): CanvasLabelmapComposition {
  let composition = compositions.get(canvas);

  if (!composition) {
    composition = { layerCount: 0, firstAlpha: 1, sumsReady: false };
    compositions.set(canvas, composition);
  }

  return composition;
}

/**
 * Starts the sums of the composition from its first layer: alpha weighted
 * colour, alpha and one minus alpha where it drew, nothing elsewhere.
 */
function startSums(
  composition: CanvasLabelmapComposition,
  pixelCount: number
): Float32Array {
  const length = pixelCount * 5;

  if (composition.sums?.length !== length) {
    composition.sums = new Float32Array(length);
  }

  const { sums, firstLayer, firstAlpha } = composition;

  for (let index = 0; index < length; index += 5) {
    sums[index] = 0;
    sums[index + 1] = 0;
    sums[index + 2] = 0;
    sums[index + 3] = 0;
    sums[index + 4] = 1;
  }

  const pixels = firstLayer.imageData.data;
  const { x, y, width, height } = firstLayer.bounds;
  const canvasWidth = firstLayer.imageData.width;

  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      const pixel = row * canvasWidth + column;
      const alpha = (pixels[pixel * 4 + 3] / 255) * firstAlpha;

      if (!alpha) {
        continue;
      }

      const sum = pixel * 5;

      sums[sum] = pixels[pixel * 4] * alpha;
      sums[sum + 1] = pixels[pixel * 4 + 1] * alpha;
      sums[sum + 2] = pixels[pixel * 4 + 2] * alpha;
      sums[sum + 3] = alpha;
      sums[sum + 4] = 1 - alpha;
    }
  }

  composition.sumsReady = true;

  return sums;
}

/**
 * Composes a labelmap layer on a canvas as the GPU composes the translucent
 * layers of a view (vtk.js `OrderIndependentTranslucentPass`, weighted
 * blended): where labelmaps of the same pass overlap, the colour is the
 * alpha weighted mean of their colours, which covers what is below with
 * alpha `1 - prod(1 - alpha)`. The result does not depend on the order of
 * the layers. A layer that overlaps no other is drawn over the canvas.
 *
 * @param context - The context of the canvas, whose transform is ignored
 * @param layer - The layer to compose
 * @param alpha - The opacity of the whole layer
 */
export function composeCanvasLabelmapLayer(
  context: CanvasRenderingContext2D,
  layer: CanvasLabelmapLayer,
  alpha: number
): void {
  const { bounds } = layer;

  if (!bounds || !(alpha > 0)) {
    return;
  }

  const { canvas } = context;
  const composition = getComposition(canvas);
  const { x, y, width, height } = bounds;

  if (
    composition.layerCount > 0 &&
    (composition.firstLayer?.imageData.width !== canvas.width ||
      composition.firstLayer?.imageData.height !== canvas.height)
  ) {
    resetCanvasLabelmapComposition(canvas);
  }

  if (composition.layerCount === 0) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = alpha;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(layer.canvas, x, y, width, height, x, y, width, height);
    context.restore();
    composition.firstLayer = layer;
    composition.firstAlpha = alpha;
    composition.layerCount = 1;
    return;
  }

  const canvasWidth = canvas.width;
  const sums = composition.sumsReady
    ? composition.sums
    : startSums(composition, canvasWidth * canvas.height);
  const region = context.getImageData(x, y, width, height);
  const target = region.data;
  const pixels = layer.imageData.data;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const pixel = (y + row) * canvasWidth + x + column;
      const layerAlpha = (pixels[pixel * 4 + 3] / 255) * alpha;

      if (!layerAlpha) {
        continue;
      }

      const sum = pixel * 5;
      const alphaSum = sums[sum + 3];
      const reveal = sums[sum + 4];
      const nextAlphaSum = alphaSum + layerAlpha;
      const nextReveal = reveal * (1 - layerAlpha);
      const offset = (row * width + column) * 4;

      for (let channel = 0; channel < 3; channel++) {
        const colourSum = sums[sum + channel];
        const mean = alphaSum > 0 ? colourSum / alphaSum : 0;
        const below = target[offset + channel] - mean * (1 - reveal);
        const nextColourSum =
          colourSum + pixels[pixel * 4 + channel] * layerAlpha;

        target[offset + channel] =
          below * (1 - layerAlpha) +
          (nextColourSum / nextAlphaSum) * (1 - nextReveal);
        sums[sum + channel] = nextColourSum;
      }

      sums[sum + 3] = nextAlphaSum;
      sums[sum + 4] = nextReveal;
    }
  }

  context.putImageData(region, x, y);
  composition.layerCount += 1;
}
