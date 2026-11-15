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
import { getVolumeClipPlanes } from './planarSampledSlice';
import type {
  PlanarSampledSlice,
  PlanarScreenCamera,
  PlanarSliceClipPlane,
} from './planarSampledSlice';
import { PlanarSampledSliceActor } from './planarSampledSliceActor';

/**
 * The largest distance, in device pixels, by which a transform may miss the
 * identity and still count as the identity. A slice of the screen grid maps
 * to the canvas one to one up to the rounding of the canvas to world
 * function, and is then copied without any filtering.
 */
const IDENTITY_TOLERANCE = 1e-3;

/**
 * The steps of the colour and opacity tables between two texels of the
 * tables of the GPU draw step. A step of 1/64 of a texel keeps the error of
 * a table read below a tenth of a colour level for a colour table, whose
 * neighbour texels differ by a few levels; only a jump of the opacity table,
 * as at a threshold, can give more, for values within one texel of it.
 */
const TEXEL_STEPS = 64;

/**
 * The part of a slice pixel by which a slice drawn with nearest filtering is
 * moved back along its rows and columns. A canvas pixel whose centre falls
 * exactly on the edge between two slice pixels then shows the second one, as
 * the nearest texel read of the GPU (`floor` of the texel coordinate) does;
 * the canvas would show the first.
 */
const NEAREST_TIE_SHIFT = 1 / 8192;

/**
 * The colour and opacity of one layer as the GPU draw step gives them, as
 * tables over the value of a pixel: `colours` holds the packed red, green and
 * blue of a step and `alphas` its alpha, 0 to 255. A value v reads the step
 * `v * scale + offset` of each table, clamped to the table.
 */
type PlanarSliceColourTables = {
  colours: Uint32Array;
  colourScale: number;
  colourOffset: number;
  alphas: Uint8ClampedArray;
  alphaScale: number;
  alphaOffset: number;
  nearest: boolean;
  opacity: number;
};

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
 * A slice of one value per pixel is coloured as the GPU draw step colours
 * it, so that both draw steps give the same picture: the presentation is
 * applied with `PlanarSampledSliceActor.applyPresentation` to an actor that
 * is never drawn, and its colour and opacity functions become the tables of
 * the vtk.js image mapper (`getColourTables`), read the way its shader reads
 * them. The pixels outside the faces of the volume are left clear, as the
 * clip planes of the GPU draw step leave them. The coloured slice is drawn
 * over the layers below it with its alpha, as the GPU blends a layer.
 *
 * A labelmap is coloured by its `CanvasActor`, and a slice of a colour volume
 * becomes an `IImage` that the CPU fallback pipeline (`drawImageSync`) turns
 * into colours one to one. That picture is drawn on the layer canvas of the
 * display set and composed on the canvas of the viewport with the opacity of
 * the presentation.
 *
 * Either picture is placed with the transform from the slice to the canvas
 * (`getSliceCanvasTransform`), so any pan, zoom, rotation and flip of the
 * camera places it. A slice of voxel size is enlarged by the canvas, with
 * image smoothing unless the presentation asks for NEAREST. A slice of the
 * screen grid maps to the canvas one to one and is copied unchanged.
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
  private presentationActor?: PlanarSampledSliceActor;
  private presentationKey?: string;
  private colourTables?: PlanarSliceColourTables;
  private clipPlanes?: PlanarSliceClipPlane[];
  private sliceImageData?: ImageData;
  private colouredSlice?: PlanarSampledSlice;
  private colouredTables?: PlanarSliceColourTables;

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
   * Draws the slice set last. A slice of one value per pixel is drawn over
   * the canvas of the viewport with the colours of the GPU draw step
   * (`drawWithTransferFunctions`); a labelmap or a colour slice is drawn on
   * the layer canvas, which is composed on the canvas of the viewport.
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

    resizeCanvas(this.sliceCanvas, slice.width, slice.height);

    if (!canvasActor && (slice.numberOfComponents ?? 1) === 1) {
      this.drawWithTransferFunctions(args);
      return;
    }

    resizeCanvas(this.layerCanvas, target.canvas.width, target.canvas.height);

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
    this.presentationActor = undefined;
    this.presentationKey = undefined;
    this.colourTables = undefined;
    this.sliceImageData = undefined;
    this.colouredSlice = undefined;
    this.colouredTables = undefined;
  }

  /**
   * Draws a slice of one value per pixel with the colours of the GPU draw
   * step. The slice is coloured again for a new slice, new tables or when the
   * colours are invalidated; a move of the view only places it again.
   */
  private drawWithTransferFunctions(args: {
    target: PlanarCanvasTarget;
    camera: PlanarScreenCamera;
    presentation?: PlanarDataPresentation;
    defaultVOIRange?: VOIRange;
    invalidated: boolean;
  }): void {
    const { target, camera } = args;
    const { slice } = this;
    const tables = this.getColourTables(
      args.presentation,
      args.defaultVOIRange
    );
    const sliceContext = this.sliceCanvas.getContext('2d');

    if (!sliceContext || tables.opacity <= 0) {
      return;
    }

    if (
      args.invalidated ||
      slice !== this.colouredSlice ||
      tables !== this.colouredTables
    ) {
      if (
        this.sliceImageData?.width !== slice.width ||
        this.sliceImageData.height !== slice.height
      ) {
        this.sliceImageData = sliceContext.createImageData(
          slice.width,
          slice.height
        );
      }

      const pixels = new Uint32Array(this.sliceImageData.data.buffer);

      colourSlice(slice.pixelData, pixels, tables);

      if (!slice.insideVolume) {
        this.clipPlanes ||= getVolumeClipPlanes(this.volume);
        clearOutsideVolume(slice, this.clipPlanes, pixels);
      }

      sliceContext.putImageData(this.sliceImageData, 0, 0);
      this.colouredSlice = slice;
      this.colouredTables = tables;
    }

    const transform = getSliceCanvasTransform(slice, camera, target.canvas);

    if (tables.nearest) {
      transform[4] -= (transform[0] + transform[2]) * NEAREST_TIE_SHIFT;
      transform[5] -= (transform[1] + transform[3]) * NEAREST_TIE_SHIFT;
    }

    target.context.save();
    target.context.imageSmoothingEnabled = !tables.nearest;
    target.context.setTransform(...transform);
    target.context.drawImage(this.sliceCanvas, 0, 0);
    target.context.restore();
  }

  /**
   * The colour tables of the presentation. The presentation is applied to the
   * actor of the GPU draw step (`PlanarSampledSliceActor`), which is never
   * drawn here, only when it changed, as the GPU draw step applies it; the
   * tables are then read from that actor.
   */
  private getColourTables(
    presentation: PlanarDataPresentation | undefined,
    defaultVOIRange: VOIRange | undefined
  ): PlanarSliceColourTables {
    const key = JSON.stringify([presentation ?? null, defaultVOIRange ?? null]);

    if (this.colourTables && key === this.presentationKey) {
      return this.colourTables;
    }

    this.presentationActor ||= new PlanarSampledSliceActor({
      voxelManager: this.volume.voxelManager,
    });
    this.presentationActor.applyPresentation(presentation, defaultVOIRange);
    this.presentationKey = key;
    this.colourTables = getColourTables(this.presentationActor);

    return this.colourTables;
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

/**
 * The colour and opacity tables of the vtk.js image mapper for the
 * presentation of an actor, as `PlanarSliceColourTables`. They follow its
 * OpenGL mapper: the colour function becomes a table of
 * `colorTextureWidth` texels of 8-bit red, green and blue over its range, the
 * opacity function a table of `opacityTextureWidth` float texels over its own
 * range, and a value maps to the texture coordinate
 * `(value - level) / window + 0.5`. Without a colour function the table is
 * the grey ramp of vtk.js with the colour window and level of the property.
 * A texture is read with linear filtering between texel centres and clamped
 * at its ends, or the nearest texel for NEAREST interpolation. The alpha is
 * the opacity of the table times the opacity of the property.
 */
function getColourTables(
  presentationActor: Pick<PlanarSampledSliceActor, 'actor' | 'mapper'>
): PlanarSliceColourTables {
  const property = presentationActor.actor.getProperty();
  const nearest =
    property.getInterpolationType() ===
    (InterpolationType.NEAREST as unknown as ReturnType<
      typeof property.getInterpolationType
    >);
  const opacity = property.getOpacity();
  const colourWidth = presentationActor.mapper.getColorTextureWidth();
  const colourTexels = new Uint8ClampedArray(colourWidth * 3);
  const colourFunction = property.getRGBTransferFunction(0);
  let window = property.getColorWindow();
  let level = property.getColorLevel();

  if (colourFunction) {
    const [lower, upper] = colourFunction.getRange();
    const values = new Float32Array(colourWidth * 3);

    (
      colourFunction.getTable as unknown as (
        xStart: number,
        xEnd: number,
        size: number,
        table: Float32Array,
        stride: number
      ) => void
    )(lower, upper, colourWidth, values, 1);

    for (let index = 0; index < values.length; index++) {
      colourTexels[index] = 255 * values[index];
    }

    if (
      (
        property as unknown as { getUseLookupTableScalarRange(): boolean }
      ).getUseLookupTableScalarRange()
    ) {
      window = upper - lower;
      level = 0.5 * (upper + lower);
    }
  } else {
    for (let index = 0; index < colourWidth * 3; ++index) {
      colourTexels[index] = (255 * index) / ((colourWidth - 1) * 3);
      colourTexels[index + 1] = (255 * index) / ((colourWidth - 1) * 3);
      colourTexels[index + 2] = (255 * index) / ((colourWidth - 1) * 3);
    }
  }

  const opacityWidth = presentationActor.mapper.getOpacityTextureWidth();
  const opacityTexels = new Float32Array(opacityWidth).fill(1);
  const opacityFunction = property.getPiecewiseFunction(0);
  let opacityWindow = 1;
  let opacityLevel = 0.5;

  if (opacityFunction) {
    const [lower, upper] = opacityFunction.getRange();

    opacityFunction.getTable(lower, upper, opacityWidth, opacityTexels, 1);
    opacityWindow = upper - lower;
    opacityLevel = 0.5 * (upper + lower);
  }

  const [colourScale, colourOffset] = getTableMapping(
    colourWidth,
    window,
    level
  );
  const [alphaScale, alphaOffset] = getTableMapping(
    opacityWidth,
    opacityWindow,
    opacityLevel
  );

  return {
    colours: getColourSteps(colourTexels, nearest),
    colourScale,
    colourOffset,
    alphas: getAlphaSteps(opacityTexels, opacity, nearest),
    alphaScale,
    alphaOffset,
    nearest,
    opacity,
  };
}

/**
 * The scale and offset that turn a value into a step of a table of `width`
 * texels, TEXEL_STEPS steps per texel, for a texture coordinate of
 * `(value - level) / window + 0.5`. Texel i has its centre at the step
 * i * TEXEL_STEPS.
 */
function getTableMapping(
  width: number,
  window: number,
  level: number
): [number, number] {
  return [
    (width * TEXEL_STEPS) / window,
    ((0.5 - level / window) * width - 0.5) * TEXEL_STEPS,
  ];
}

/**
 * The value that a texture read gives at each step of a table of texels,
 * TEXEL_STEPS steps per texel, with linear filtering between texel centres or
 * the nearest texel. The texels are every `stride`-th value of `texels` from
 * `offset` on.
 */
function getTextureSteps(
  texels: ArrayLike<number>,
  stride: number,
  offset: number,
  nearest: boolean
): Float32Array {
  const width = texels.length / stride;
  const steps = new Float32Array((width - 1) * TEXEL_STEPS + 1);

  for (let texel = 0; texel < width - 1; texel++) {
    const first = texels[texel * stride + offset];
    const next = texels[(texel + 1) * stride + offset];
    const start = texel * TEXEL_STEPS;

    for (let step = 0; step < TEXEL_STEPS; step++) {
      steps[start + step] = nearest
        ? step < TEXEL_STEPS / 2
          ? first
          : next
        : first + ((next - first) * step) / TEXEL_STEPS;
    }
  }

  steps[steps.length - 1] = texels[(width - 1) * stride + offset];

  return steps;
}

/** The packed red, green and blue of each step of a colour table. */
function getColourSteps(
  texels: Uint8ClampedArray,
  nearest: boolean
): Uint32Array {
  const red = getTextureSteps(texels, 3, 0, nearest);
  const green = getTextureSteps(texels, 3, 1, nearest);
  const blue = getTextureSteps(texels, 3, 2, nearest);
  const steps = new Uint32Array(red.length);

  for (let step = 0; step < steps.length; step++) {
    steps[step] =
      Math.round(red[step]) |
      (Math.round(green[step]) << 8) |
      (Math.round(blue[step]) << 16);
  }

  return steps;
}

/** The alpha, 0 to 255, of each step of an opacity table. */
function getAlphaSteps(
  texels: Float32Array,
  opacity: number,
  nearest: boolean
): Uint8ClampedArray {
  const values = getTextureSteps(texels, 1, 0, nearest);
  const steps = new Uint8ClampedArray(values.length);

  for (let step = 0; step < steps.length; step++) {
    steps[step] = 255 * opacity * values[step];
  }

  return steps;
}

/**
 * Colours the values of a slice with the tables of `getColourTables` into
 * RGBA pixels, one 32-bit word per pixel in the byte order of ImageData.
 */
function colourSlice(
  pixelData: PixelDataTypedArray,
  pixels: Uint32Array,
  tables: PlanarSliceColourTables
): void {
  const {
    colours,
    colourScale,
    colourOffset,
    alphas,
    alphaScale,
    alphaOffset,
  } = tables;
  const lastColour = colours.length - 1;
  const lastAlpha = alphas.length - 1;

  for (let index = 0; index < pixels.length; index++) {
    const value = pixelData[index];
    let colourStep = value * colourScale + colourOffset;
    let alphaStep = value * alphaScale + alphaOffset;

    colourStep =
      colourStep > 0 ? (colourStep < lastColour ? colourStep : lastColour) : 0;
    alphaStep =
      alphaStep > 0 ? (alphaStep < lastAlpha ? alphaStep : lastAlpha) : 0;
    pixels[index] =
      colours[(colourStep + 0.5) | 0] | (alphas[(alphaStep + 0.5) | 0] << 24);
  }
}

/**
 * Clears the pixels of a slice whose centre lies outside one of the faces of
 * the volume, which is what the clip planes of the GPU draw step discard.
 * Each row keeps one run of pixels, found from the distance of its first
 * pixel to each plane and the change of that distance along the row.
 */
function clearOutsideVolume(
  slice: PlanarSampledSlice,
  planes: PlanarSliceClipPlane[],
  pixels: Uint32Array
): void {
  const { width, height, origin, xDirection, yDirection, spacing } = slice;

  for (let row = 0; row < height; row++) {
    let first = 0;
    let last = width - 1;

    for (const plane of planes) {
      let distance = 0;
      let step = 0;

      for (let axis = 0; axis < 3; axis++) {
        distance +=
          (origin[axis] +
            yDirection[axis] * spacing[1] * row -
            plane.origin[axis]) *
          plane.normal[axis];
        step += xDirection[axis] * spacing[0] * plane.normal[axis];
      }

      if (step > 0) {
        first = Math.max(first, Math.ceil(-distance / step - 1e-6));
      } else if (step < 0) {
        last = Math.min(last, Math.floor(-distance / step + 1e-6));
      } else if (distance < 0) {
        first = width;
      }
    }

    const rowStart = row * width;

    if (first > last) {
      pixels.fill(0, rowStart, rowStart + width);
      continue;
    }

    pixels.fill(0, rowStart, rowStart + first);
    pixels.fill(0, rowStart + last + 1, rowStart + width);
  }
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
