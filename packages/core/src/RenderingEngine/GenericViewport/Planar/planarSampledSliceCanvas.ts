import { InterpolationType, VOILUTFunctionType } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  ICanvasActor,
  IImage,
  IImageVolume,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point2,
  Point3,
  VOIRange,
} from '../../../types';
import VoxelManager from '../../../utilities/VoxelManager';
import { createCanvas } from '../../helpers/getOrCreateCanvas';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import { resolveCPUFallbackColormap } from '../../helpers/cpuFallback/colors';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import { worldToCanvasPlanarViewState } from './planarAdapterCoordinateTransforms';
import type {
  PlanarDataPresentation,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type {
  PlanarSampledSlice,
  PlanarScreenCamera,
} from './planarSampledSlice';

/**
 * The largest distance, in device pixels, by which a transform may miss the
 * identity and still count as the identity. A slice of the screen grid maps
 * to the canvas one to one up to the rounding of the canvas to world
 * function, and is then copied without any filtering.
 */
const IDENTITY_TOLERANCE = 1e-3;

/** The 2D canvas of a viewport and the state of its composition pass. */
export type PlanarCanvasTarget = PlanarViewportRenderContext['cpu'];

/**
 * A 2D affine transform from the pixel space of a slice image (pixel i, j
 * covers [i, i + 1] x [j, j + 1]) to the device pixels of the canvas, in the
 * order of `CanvasRenderingContext2D.setTransform`.
 */
export type PlanarSliceCanvasTransform = [
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * The CPU draw step of the sampled slice: it draws a `PlanarSampledSlice` on
 * the 2D canvas of a viewport. It is the only part of the CPU volume path that
 * knows the canvas drawing, the counterpart of `PlanarSampledSliceActor` on
 * the vtk.js path.
 *
 * The slice becomes an `IImage` that the CPU fallback pipeline
 * (`drawImageSync`) turns into colours one to one, on a canvas of the size of
 * the slice, with the VOI, the colormap and invert of the presentation. A
 * labelmap is coloured by its `CanvasActor` instead. That picture is then
 * drawn on the layer canvas of the display set with the transform from the
 * slice to the canvas (`getSliceCanvasTransform`), so any pan, zoom, rotation
 * and flip of the camera places it, and the layer is composed on the canvas
 * of the viewport with the opacity of the presentation.
 *
 * A slice of voxel size is enlarged by the canvas, with image smoothing
 * unless the presentation asks for NEAREST, as the CPU fallback pipeline
 * enlarges a stack image. A slice of the screen grid maps to the canvas one
 * to one and is copied unchanged.
 */
export class PlanarSampledSliceCanvas {
  /** The canvas of this display set, of the size of the viewport canvas. */
  readonly layerCanvas: HTMLCanvasElement;
  private readonly sliceCanvas: HTMLCanvasElement;
  private enabledElement?: CPUFallbackEnabledElement;
  private slice?: PlanarSampledSlice;
  private image?: IImage;
  private roundedPixelData?: Int32Array;
  private sequence = 0;

  constructor(
    private readonly volume: IImageVolume,
    width: number,
    height: number
  ) {
    this.layerCanvas = createCanvas(null, width, height);
    this.sliceCanvas = createCanvas(null, 1, 1);
  }

  /**
   * Sets the slice to draw and returns its image. The image is made again only
   * for another slice, so its LUT and colours are kept across redraws.
   *
   * @returns the image of the slice and whether it is new
   */
  setSlice(slice: PlanarSampledSlice): { image: IImage; changed: boolean } {
    if (slice === this.slice && this.image) {
      return { image: this.image, changed: false };
    }

    this.slice = slice;
    this.image = this.createSliceImage(slice);

    return { image: this.image, changed: true };
  }

  /** The image of the slice set last, or undefined. */
  getImage(): IImage | undefined {
    return this.image;
  }

  /**
   * Draws the slice set last on the layer canvas and composes the layer on
   * the canvas of the viewport.
   *
   * @param args.target - The canvas of the viewport.
   * @param args.camera - The camera of the view, which places the slice.
   * @param args.presentation - VOI, colormap, invert, interpolation, opacity.
   * @param args.defaultVOIRange - The VOI when the presentation has none.
   * @param args.invalidated - True when the colours must be made again.
   * @param args.canvasActor - The actor that colours a labelmap; when given,
   *   the slice is drawn by the actor and not by the VOI pipeline.
   */
  draw(args: {
    target: PlanarCanvasTarget;
    camera: PlanarScreenCamera;
    presentation?: PlanarDataPresentation;
    defaultVOIRange?: VOIRange;
    invalidated: boolean;
    canvasActor?: ICanvasActor;
  }): void {
    const { target, camera, presentation, canvasActor } = args;
    const { slice, image } = this;

    if (!slice || !image) {
      return;
    }

    resizeCanvas(this.layerCanvas, target.canvas.width, target.canvas.height);
    resizeCanvas(this.sliceCanvas, slice.width, slice.height);

    const enabledElement = this.updateEnabledElement(
      image,
      presentation,
      args.defaultVOIRange
    );

    if (canvasActor) {
      this.drawWithCanvasActor(canvasActor);
    } else {
      drawImageSync(enabledElement, args.invalidated);
    }

    const layerContext = this.layerCanvas.getContext('2d');

    if (!layerContext) {
      return;
    }

    layerContext.setTransform(1, 0, 0, 1, 0, 0);
    layerContext.clearRect(
      0,
      0,
      this.layerCanvas.width,
      this.layerCanvas.height
    );

    if (!canvasActor && !enabledElement.viewport.colormap) {
      layerContext.fillStyle = 'black';
      layerContext.fillRect(
        0,
        0,
        this.layerCanvas.width,
        this.layerCanvas.height
      );
    }

    layerContext.imageSmoothingEnabled =
      !enabledElement.viewport.pixelReplication;
    layerContext.setTransform(
      ...getSliceCanvasTransform(slice, camera, this.layerCanvas)
    );
    layerContext.drawImage(this.sliceCanvas, 0, 0);
    layerContext.setTransform(1, 0, 0, 1, 0, 0);
    composeLayer(target, this.layerCanvas, presentation?.opacity ?? 1);
  }

  /** Drops the slice and its image. */
  release(): void {
    this.slice = undefined;
    this.image = undefined;
    this.enabledElement = undefined;
    this.roundedPixelData = undefined;
  }

  /**
   * Points the CPU fallback element at the slice canvas and sets its viewport
   * so that the image maps to that canvas one to one: an explicit scale of 1
   * along both axes, no pan, rotation or flip. The VOI, colormap, invert and
   * interpolation come from the presentation, as for a stack image.
   */
  private updateEnabledElement(
    image: IImage,
    presentation: PlanarDataPresentation | undefined,
    defaultVOIRange: VOIRange | undefined
  ): CPUFallbackEnabledElement {
    const modality = this.volume.metadata?.Modality;
    const resolvedVOI = getResolvedVOIRange(
      presentation?.voiRange ?? defaultVOIRange,
      image.minPixelValue ?? 0,
      image.maxPixelValue ?? 1
    );
    const viewport = getDefaultViewport(this.sliceCanvas, image, modality);

    (viewport as { scale?: number | Point2 }).scale = [1, 1];
    viewport.colormap = resolveCPUFallbackColormap(
      presentation?.colormap,
      image.colormap,
      { voiRange: resolvedVOI }
    );
    viewport.invert = presentation?.invert ?? false;
    viewport.pixelReplication =
      presentation?.interpolationType === InterpolationType.NEAREST;
    viewport.voi = {
      windowCenter: (resolvedVOI.lower + resolvedVOI.upper) / 2,
      windowWidth: Math.max(resolvedVOI.upper - resolvedVOI.lower, 1),
      voiLUTFunction: VOILUTFunctionType.LINEAR,
    };

    this.enabledElement ||= {
      canvas: this.sliceCanvas,
      image,
      options: { transparentBackground: true },
      renderingTools: {},
      viewport,
    } as CPUFallbackEnabledElement;
    this.enabledElement.canvas = this.sliceCanvas;
    this.enabledElement.image = image;
    this.enabledElement.viewport = viewport;

    return this.enabledElement;
  }

  /** Colours the slice of a labelmap with its actor, one to one. */
  private drawWithCanvasActor(canvasActor: ICanvasActor): void {
    const context = this.sliceCanvas.getContext('2d');

    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.sliceCanvas.width, this.sliceCanvas.height);
    canvasActor.render(undefined as never, context);
  }

  /**
   * Makes the image of a slice for the CPU fallback pipeline. Its LUT reads
   * whole stored values, so the samples of a float volume are rounded into an
   * Int32Array, apart from a PT volume, whose float SUV values the pipeline
   * maps with a function in place of a LUT. The lowest and highest values of
   * the image are whole numbers for the same reason.
   *
   * A slice of a colour volume (3 or 4 components per pixel) is a colour
   * image, RGB or RGBA, which the pipeline draws with its colour LUT, as the
   * CPU volume path drew colour volumes before it used the shared sampler.
   */
  private createSliceImage(slice: PlanarSampledSlice): IImage {
    const { volume } = this;
    const numberOfComponents = slice.numberOfComponents ?? 1;
    const color = numberOfComponents > 1;
    const keepFloats =
      volume.metadata?.Modality === 'PT' || !isFloatArray(slice.pixelData);
    const pixelData = keepFloats
      ? slice.pixelData
      : this.roundPixelData(slice.pixelData);
    const lowest = Number.isFinite(slice.min) ? slice.min : 0;
    const highest = Number.isFinite(slice.max) ? slice.max : lowest;
    const minPixelValue =
      keepFloats && isFloatArray(pixelData) ? lowest : Math.floor(lowest);
    let maxPixelValue =
      keepFloats && isFloatArray(pixelData) ? highest : Math.ceil(highest);

    if (!(maxPixelValue > minPixelValue)) {
      maxPixelValue = minPixelValue + 1;
    }

    const { width, height } = slice;
    const imageId = `cpuVolumeSlice:${volume.volumeId}:${++this.sequence}`;
    const windowWidth = Math.max(1, maxPixelValue - minPixelValue);

    return {
      imageId,
      intercept: 0,
      windowCenter: (minPixelValue + maxPixelValue) / 2,
      windowWidth,
      voiLUTFunction: VOILUTFunctionType.LINEAR,
      isPreScaled: volume.isPreScaled,
      scaling: volume.scaling,
      color,
      numberOfComponents,
      dataType: pixelData.constructor.name as PixelDataTypedArrayString,
      slope: 1,
      minPixelValue,
      maxPixelValue,
      rows: height,
      columns: width,
      getCanvas: undefined,
      height,
      width,
      rgba: numberOfComponents === 4,
      columnPixelSpacing: slice.spacing[0],
      rowPixelSpacing: slice.spacing[1],
      FrameOfReferenceUID: volume.metadata?.FrameOfReferenceUID,
      invert: false,
      photometricInterpretation: color ? 'RGB' : undefined,
      getPixelData: () => pixelData,
      voxelManager: VoxelManager.createImageVoxelManager({
        width,
        height,
        scalarData: pixelData,
        numberOfComponents,
        id: imageId,
      }),
      sizeInBytes: pixelData.byteLength,
    } as IImage;
  }

  /** Rounds float samples into an Int32Array that is reused for each slice. */
  private roundPixelData(pixelData: PixelDataTypedArray): Int32Array {
    const rounded =
      this.roundedPixelData?.length === pixelData.length
        ? this.roundedPixelData
        : new Int32Array(pixelData.length);

    for (let index = 0; index < pixelData.length; index++) {
      rounded[index] = Math.round(pixelData[index]);
    }

    this.roundedPixelData = rounded;

    return rounded;
  }
}

/**
 * The transform from the pixel space of a slice to the device pixels of a
 * canvas, for a camera. Each corner of the slice is placed with
 * `worldToCanvasPlanarViewState`, the world to canvas function of the planar
 * viewports, so the slice lands where tools find its voxels, for any pan,
 * zoom, rotation, flip and presentation scale. The steps along a row and a
 * column are measured over the whole slice, which keeps the rounding of that
 * function small. A transform within IDENTITY_TOLERANCE of the identity, as
 * that of a slice of the screen grid, is the identity.
 */
export function getSliceCanvasTransform(
  slice: Pick<
    PlanarSampledSlice,
    'origin' | 'xDirection' | 'yDirection' | 'spacing' | 'width' | 'height'
  >,
  camera: PlanarScreenCamera,
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>
): PlanarSliceCanvasTransform {
  const toCanvas = (column: number, row: number): Point2 =>
    worldToCanvasPlanarViewState({
      camera,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      worldPos: [0, 1, 2].map(
        (axis) =>
          slice.origin[axis] +
          slice.xDirection[axis] * slice.spacing[0] * column +
          slice.yDirection[axis] * slice.spacing[1] * row
      ) as Point3,
    });
  const first = toCanvas(0, 0);
  const lastColumn = toCanvas(slice.width, 0);
  const lastRow = toCanvas(0, slice.height);
  const columnStep: Point2 = [
    (lastColumn[0] - first[0]) / slice.width,
    (lastColumn[1] - first[1]) / slice.width,
  ];
  const rowStep: Point2 = [
    (lastRow[0] - first[0]) / slice.height,
    (lastRow[1] - first[1]) / slice.height,
  ];
  const transform: PlanarSliceCanvasTransform = [
    columnStep[0],
    columnStep[1],
    rowStep[0],
    rowStep[1],
    first[0] - (columnStep[0] + rowStep[0]) / 2,
    first[1] - (columnStep[1] + rowStep[1]) / 2,
  ];
  const identity: PlanarSliceCanvasTransform = [1, 0, 0, 1, 0, 0];
  const isIdentity = transform.every(
    (value, index) =>
      Math.abs(value - identity[index]) <=
      (index < 4
        ? IDENTITY_TOLERANCE / Math.max(slice.width, slice.height)
        : IDENTITY_TOLERANCE)
  );

  return isIdentity ? identity : transform;
}

/**
 * Clears the canvas of a viewport to black once per render pass, before the
 * first display set of the pass draws, so every layer of the pass composes
 * on the same background.
 */
export function beginPlanarCanvasPass(target: PlanarCanvasTarget): void {
  const { canvas, composition, context } = target;

  if (composition.clearedRenderPassId === composition.renderPassId) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  composition.clearedRenderPassId = composition.renderPassId;
}

/**
 * The VOI to draw with: the given VOI when it is a valid window, else the
 * fallback range, else a window of one value above the fallback lower bound.
 */
export function getResolvedVOIRange(
  voiRange: VOIRange | undefined,
  fallbackLower: number,
  fallbackUpper: number
): VOIRange {
  if (
    voiRange &&
    Number.isFinite(voiRange.lower) &&
    Number.isFinite(voiRange.upper) &&
    voiRange.upper > voiRange.lower
  ) {
    return voiRange;
  }

  if (fallbackUpper > fallbackLower) {
    return { lower: fallbackLower, upper: fallbackUpper };
  }

  return { lower: fallbackLower, upper: fallbackLower + 1 };
}

function composeLayer(
  target: PlanarCanvasTarget,
  layerCanvas: HTMLCanvasElement,
  opacity: number
): void {
  if (opacity <= 0) {
    return;
  }

  target.context.save();
  target.context.globalAlpha = opacity;
  target.context.drawImage(layerCanvas, 0, 0);
  target.context.restore();
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function isFloatArray(pixelData: PixelDataTypedArray): boolean {
  return pixelData instanceof Float32Array || pixelData instanceof Float64Array;
}
