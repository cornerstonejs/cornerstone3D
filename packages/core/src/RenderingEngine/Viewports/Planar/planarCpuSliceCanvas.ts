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
import { sampleVolumeGrid } from '../../../utilities/sampleVolumeGrid';
import { transformWorldToIndexContinuous } from '../../../utilities/transformWorldToIndex';
import { getExactSliceAxis } from '../../../utilities/volumeSliceGeometry';
import { createCanvas } from '../../helpers/getOrCreateCanvas';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import { resolveCPUFallbackColormap } from '../../helpers/cpuFallback/colors';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import { applyPlanarImageAppearance } from '../../helpers/planarImageRendering';
import { worldToCanvasPlanarViewState } from './planarAdapterCoordinateTransforms';
import type {
  PlanarDisplaySetAppearance,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import { getVolumeClipPlanes } from './planarCpuSlice';
import { hasSlab } from './PlanarRenderPathDecisionService';
import type {
  PlanarCpuSlice,
  PlanarScreenCamera,
  PlanarSliceClipPlane,
} from './planarCpuSlice';
import { PlanarCpuSliceActor } from './planarCpuSliceActor';
import {
  resetCanvasLabelmapComposition,
  setOutlineAtImageEdges,
} from '../../CanvasActor/canvasLabelmapLayer';

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
 * The most distinct values of a slice of whole numbers that are coloured
 * through a table of one colour per value (`colourWholeNumbers`).
 */
const MAX_VALUE_TABLE_SIZE = 65536;

/**
 * The point of a canvas pixel, from its top left corner in pixels, at which
 * a slice clipped by planes is tested: its centre, where the clip planes of
 * the GPU draw step test a pixel.
 */
const CENTRE_SAMPLE: Point2[] = [[0.5, 0.5]];

/**
 * The four sample points of a canvas pixel in a 4x multisampled WebGL
 * picture, from its top left corner in pixels. The GPU draws a slice along a
 * volume axis, and an image, as a quad whose edges lie on the faces, and a
 * pixel on such an edge shows the slice in the share of these points that
 * lie inside. They are tested on a slice that maps to the canvas one to one,
 * whose pixels are the canvas pixels.
 */
const EDGE_SAMPLES: Point2[] = [
  [0.375, 0.875],
  [0.875, 0.625],
  [0.125, 0.375],
  [0.625, 0.125],
];

/**
 * The colour and opacity of one layer as the GPU draw step gives them, as
 * tables over the value of a pixel: `colours` holds the packed red, green and
 * blue of a step and `alphas` its alpha, 0 to 255. `alphaFractions` holds
 * the same alpha from 0 to 1 before any rounding, the alpha that the GPU
 * blends with. A value v reads the step `v * scale + offset` of each table,
 * clamped to the table. `colourTexels` and `opacityTexels` are the texels of
 * the textures of the GPU draw step that the steps were made from.
 *
 * @internal
 */
export type PlanarSliceColourTables = {
  colourTexels: Uint8ClampedArray;
  opacityTexels: Float32Array;
  colours: Uint32Array;
  colourScale: number;
  colourOffset: number;
  alphas: Uint8ClampedArray;
  alphaFractions: Float32Array;
  alphaScale: number;
  alphaOffset: number;
  nearest: boolean;
  opacity: number;
};

/** The 2D canvas of a viewport and the state of its composition pass. */
export type PlanarCanvasTarget = PlanarViewportRenderContext['cpu'];

/**
 * The GPU draw step whose picture a `PlanarCpuSliceCanvas` draws.
 * `volume`, the default, is the slice of a volume drawn by
 * `PlanarCpuSliceActor`, with the appearance of a volume slice. `image`
 * is an acquired image of a stack drawn by `VtkFrameRenderPath`: the
 * appearance of an image (`applyPlanarImageAppearance`), and a colour
 * image whose red, green and blue each read the colour table, as the vtk.js
 * image mapper reads an image of three dependent components.
 */
export type PlanarSliceCanvasAppearance = 'volume' | 'image';

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
 * The CPU draw step of the sampled slice: it draws a `PlanarCpuSlice` on
 * the 2D canvas of a viewport. It is the only part of the CPU volume path that
 * knows the canvas drawing, the counterpart of `PlanarCpuSliceActor` on
 * the vtk.js path.
 *
 * A slice of one value per pixel is coloured as the GPU draw step colours
 * it, so that both draw steps give the same picture: the appearance is
 * applied with `PlanarCpuSliceActor.applyAppearance` to an actor that
 * is never drawn, and its colour and opacity functions become the tables of
 * the vtk.js image mapper (`getColourTables`), read the way its shader reads
 * them. The pixels outside the faces of the volume are left clear, as the
 * clip planes of the GPU draw step leave them; on a slice along a volume axis
 * that maps to the canvas one to one, a pixel on a face shows the slice in
 * the share of it that the slice covers, as the multisampled edge of the quad
 * that the GPU draws (`clearOutsideVolume`). The coloured slice is drawn over
 * the layers below it with its alpha, as the GPU blends a layer; a
 * translucent slice that maps one to one or is drawn NEAREST is blended with
 * its alpha before any rounding (`blendSlice`).
 *
 * A labelmap is drawn by its `CanvasActor` on the canvas of the viewport, in
 * canvas pixels with its outline, as the GPU draws a labelmap slice. A slice
 * of a colour volume becomes an `IImage` that the CPU fallback pipeline
 * (`drawImageSync`) turns into colours one to one. That picture is drawn on
 * the layer canvas of the display set and composed on the canvas of the
 * viewport with the opacity of the appearance.
 *
 * Either picture is placed with the transform from the slice to the canvas
 * (`getSliceCanvasTransform`), so any pan, zoom, rotation and flip of the
 * camera places it. A slice of voxel size is enlarged by the canvas, with
 * image smoothing unless the appearance asks for NEAREST. A slice of the
 * screen grid maps to the canvas one to one and is copied unchanged.
 */
export class PlanarCpuSliceCanvas {
  /** The canvas of this display set, of the size of the viewport canvas. */
  readonly layerCanvas: HTMLCanvasElement;
  private readonly sliceCanvas: HTMLCanvasElement;
  private enabledElement?: CPUFallbackEnabledElement;
  private slice?: PlanarCpuSlice;
  private image?: IImage;
  private roundedPixelData?: Int32Array;
  private sequence = 0;
  private appearanceActor?: PlanarCpuSliceActor;
  private appearanceKey?: string;
  private colourTables?: PlanarSliceColourTables;
  private clipPlanes?: PlanarSliceClipPlane[];
  private sliceImageData?: ImageData;
  private colouredSlice?: PlanarCpuSlice;
  private colouredTables?: PlanarSliceColourTables;
  private colouredEdgeSamples?: Point2[];
  private colouredAlphas?: Float32Array;

  constructor(
    private volume: IImageVolume,
    width: number,
    height: number,
    private readonly appearanceOf: PlanarSliceCanvasAppearance = 'volume'
  ) {
    this.layerCanvas = createCanvas(null, width, height);
    this.sliceCanvas = createCanvas(null, 1, 1);
  }

  /**
   * Sets the volume that the next slices come from, as for each image of a
   * stack. The faces of that volume clip its slices.
   */
  setVolume(volume: IImageVolume): void {
    if (volume === this.volume) {
      return;
    }

    this.volume = volume;
    this.clipPlanes = undefined;
  }

  /**
   * Sets the slice to draw and returns its image. The image is made again only
   * for another slice, so its LUT and colours are kept across redraws.
   *
   * @returns the image of the slice and whether it is new
   */
  setSlice(slice: PlanarCpuSlice): { image: IImage; changed: boolean } {
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
   * Draws the slice set last. A labelmap is drawn by its actor
   * (`drawWithCanvasActor`); a slice of one value per pixel is drawn over the
   * canvas of the viewport with the colours of the GPU draw step
   * (`drawWithTransferFunctions`); a colour slice is drawn on the layer
   * canvas, which is composed on the canvas of the viewport.
   *
   * @param args.target - The canvas of the viewport.
   * @param args.camera - The camera of the view, which places the slice.
   * @param args.appearance - VOI, colormap, invert, interpolation, opacity.
   * @param args.defaultVOIRange - The VOI when the appearance has none.
   * @param args.invalidated - True when the colours must be made again.
   * @param args.canvasActor - The actor that colours a labelmap; when given,
   *   the slice is drawn by the actor and not by the VOI pipeline.
   */
  draw(args: {
    target: PlanarCanvasTarget;
    camera: PlanarScreenCamera;
    appearance?: PlanarDisplaySetAppearance;
    defaultVOIRange?: VOIRange;
    invalidated: boolean;
    canvasActor?: ICanvasActor;
  }): void {
    const { target, camera, appearance, canvasActor } = args;
    const { slice, image } = this;

    if (!slice || !image) {
      return;
    }

    if (canvasActor) {
      this.drawWithCanvasActor(
        canvasActor,
        target,
        camera,
        appearance?.opacity ?? 1
      );
      return;
    }

    resizeCanvas(this.sliceCanvas, slice.width, slice.height);

    if (
      (slice.numberOfComponents ?? 1) === 1 ||
      this.appearanceOf === 'image'
    ) {
      this.drawWithTransferFunctions(args);
      return;
    }

    resizeCanvas(this.layerCanvas, target.canvas.width, target.canvas.height);

    const enabledElement = this.updateEnabledElement(
      image,
      appearance,
      args.defaultVOIRange
    );

    drawImageSync(enabledElement, args.invalidated);

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

    if (!enabledElement.viewport.colormap) {
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
    composeLayer(target, this.layerCanvas, appearance?.opacity ?? 1);
  }

  /** Drops the slice and its image. */
  release(): void {
    this.slice = undefined;
    this.image = undefined;
    this.enabledElement = undefined;
    this.roundedPixelData = undefined;
    this.appearanceActor = undefined;
    this.appearanceKey = undefined;
    this.colourTables = undefined;
    this.sliceImageData = undefined;
    this.colouredSlice = undefined;
    this.colouredTables = undefined;
    this.colouredEdgeSamples = undefined;
    this.colouredAlphas = undefined;
  }

  /**
   * Draws a slice of one value per pixel with the colours of the GPU draw
   * step. The slice is coloured again for a new slice, new tables or when the
   * colours are invalidated; a move of the view only places it again.
   */
  private drawWithTransferFunctions(args: {
    target: PlanarCanvasTarget;
    camera: PlanarScreenCamera;
    appearance?: PlanarDisplaySetAppearance;
    defaultVOIRange?: VOIRange;
    invalidated: boolean;
  }): void {
    const { target, camera } = args;
    const { slice } = this;
    const tables = this.getColourTables(args.appearance, args.defaultVOIRange);
    const sliceContext = this.sliceCanvas.getContext('2d');

    if (!sliceContext || tables.opacity <= 0) {
      return;
    }

    const transform = getSliceCanvasTransform(slice, camera, target.canvas);
    const edgeSamples =
      isIdentityTransform(transform) &&
      getExactSliceAxis(this.volume, slice.zDirection) !== undefined
        ? EDGE_SAMPLES
        : CENTRE_SAMPLE;

    if (
      args.invalidated ||
      slice !== this.colouredSlice ||
      tables !== this.colouredTables ||
      edgeSamples !== this.colouredEdgeSamples
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

      if ((slice.numberOfComponents ?? 1) > 1) {
        colourChannels(
          slice.pixelData,
          pixels,
          tables,
          slice.numberOfComponents
        );
      } else if (!colourWholeNumbers(slice, pixels, tables)) {
        colourSlice(slice.pixelData, pixels, tables);
      }

      let edges: PlanarSliceEdgePixels | undefined;

      if (!slice.insideVolume) {
        this.clipPlanes ||= getVolumeClipPlanes(this.volume);
        edges = clearOutsideVolume(
          slice,
          this.clipPlanes,
          pixels,
          edgeSamples,
          this.volume,
          tables
        );
      }

      sliceContext.putImageData(this.sliceImageData, 0, 0);
      this.colouredSlice = slice;
      this.colouredTables = tables;
      this.colouredEdgeSamples = edgeSamples;
      this.colouredAlphas = hasTranslucentPixel(pixels)
        ? getSliceAlphas(slice, tables, edges)
        : undefined;
    }

    if (
      this.colouredAlphas &&
      (tables.nearest || isIdentityTransform(transform))
    ) {
      blendSlice(
        target,
        slice,
        this.sliceImageData,
        this.colouredAlphas,
        transform
      );
      return;
    }

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
   * The colour tables of the appearance. The appearance is applied to the
   * actor of the GPU draw step (`PlanarCpuSliceActor`), which is never
   * drawn here, only when it changed, as the GPU draw step applies it; the
   * tables are then read from that actor. For the `image` appearance the
   * appearance of an image is applied to that actor, as
   * `VtkFrameRenderPath` applies it to its own.
   */
  private getColourTables(
    appearance: PlanarDisplaySetAppearance | undefined,
    defaultVOIRange: VOIRange | undefined
  ): PlanarSliceColourTables {
    const key = JSON.stringify([appearance ?? null, defaultVOIRange ?? null]);

    if (this.colourTables && key === this.appearanceKey) {
      return this.colourTables;
    }

    this.appearanceActor ||= new PlanarCpuSliceActor({
      voxelManager: this.volume.voxelManager,
    });

    if (this.appearanceOf === 'image') {
      applyPlanarImageAppearance({
        actor: this.appearanceActor.actor,
        defaultVOIRange,
        props: appearance,
      });
    } else {
      this.appearanceActor.applyAppearance(appearance, defaultVOIRange);
    }

    this.appearanceKey = key;
    this.colourTables = getColourTables(
      this.appearanceActor,
      this.colourTables
    );

    return this.colourTables;
  }

  /**
   * Points the CPU fallback element at the slice canvas and sets its viewport
   * so that the image maps to that canvas one to one: an explicit scale of 1
   * along both axes, no pan, rotation or flip. The VOI, colormap, invert and
   * interpolation come from the appearance, as for a stack image.
   */
  private updateEnabledElement(
    image: IImage,
    appearance: PlanarDisplaySetAppearance | undefined,
    defaultVOIRange: VOIRange | undefined
  ): CPUFallbackEnabledElement {
    const modality = this.volume.metadata?.Modality;
    const resolvedVOI = getResolvedVOIRange(
      appearance?.voiRange ?? defaultVOIRange,
      image.minPixelValue ?? 0,
      image.maxPixelValue ?? 1
    );
    const viewport = getDefaultViewport(this.sliceCanvas, image, modality);

    (viewport as { scale?: number | Point2 }).scale = [1, 1];
    viewport.colormap = resolveCPUFallbackColormap(
      appearance?.colormap,
      image.colormap,
      { voiRange: resolvedVOI }
    );
    viewport.invert = appearance?.invert ?? false;
    viewport.pixelReplication =
      appearance?.interpolationType === InterpolationType.NEAREST;
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

  /**
   * Draws the slice of a labelmap with its actor on the canvas of the
   * viewport, placed with the transform from the slice to the canvas, with
   * the opacity of the appearance. The actor draws in canvas pixels, with
   * the outline, and composes with the other labelmaps of the pass. A slice
   * inside the volume ends on its faces, which get an outline, as the GPU
   * draws a labelmap slice of a volume.
   */
  private drawWithCanvasActor(
    canvasActor: ICanvasActor,
    target: PlanarCanvasTarget,
    camera: PlanarScreenCamera,
    opacity: number
  ): void {
    const { slice } = this;

    if (!(opacity > 0)) {
      return;
    }

    setOutlineAtImageEdges(canvasActor, slice.insideVolume);
    target.context.save();
    target.context.setTransform(
      ...getSliceCanvasTransform(slice, camera, target.canvas)
    );
    target.context.globalAlpha = opacity;
    canvasActor.render(undefined as never, target.context);
    target.context.restore();
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
  private createSliceImage(slice: PlanarCpuSlice): IImage {
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
 * zoom, rotation, flip and framing scale. The steps along a row and a
 * column are measured over the whole slice, which keeps the rounding of that
 * function small. A transform within IDENTITY_TOLERANCE of the identity, as
 * that of a slice of the screen grid, is the identity.
 */
export function getSliceCanvasTransform(
  slice: Pick<
    PlanarCpuSlice,
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
 * The background colour of a viewport as a canvas fill style. A viewport
 * without a background colour is black.
 */
function getBackgroundFillStyle(target: PlanarCanvasTarget): string {
  const background = target.getBackground?.();

  if (!background || background.length < 3) {
    return '#000';
  }

  const [red, green, blue] = [0, 1, 2].map((channel) =>
    Math.round(Math.max(0, Math.min(1, Number(background[channel]) || 0)) * 255)
  );

  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Clears the canvas of a viewport to the background colour of the viewport
 * once per render pass, before the first display set of the pass draws, so
 * every layer of the pass composes on the same background, and the part of
 * the canvas that no layer covers shows that colour as on the GPU draw step.
 */
export function beginPlanarCanvasPass(target: PlanarCanvasTarget): void {
  const { canvas, composition, context } = target;

  if (composition.clearedRenderPassId === composition.renderPassId) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = getBackgroundFillStyle(target);
  context.fillRect(0, 0, canvas.width, canvas.height);
  resetCanvasLabelmapComposition(canvas);
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
 * appearance of an actor, as `PlanarSliceColourTables`. They follow its
 * OpenGL mapper: the colour function becomes a table of
 * `colorTextureWidth` texels of 8-bit red, green and blue over its range, the
 * opacity function a table of `opacityTextureWidth` float texels over its own
 * range, and a value maps to the texture coordinate
 * `(value - level) / window + 0.5`. Without a colour function the table is
 * the grey ramp of vtk.js with the colour window and level of the property.
 * A texture is read with linear filtering between texel centres and clamped
 * at its ends, or the nearest texel for NEAREST interpolation. The alpha is
 * the opacity of the table times the opacity of the property.
 *
 * The steps of a table are made again only when its texels changed. A change
 * of the window of a linear or sigmoid VOI, and of a colormap, moves only
 * the window and level of the tables: their texels stay the same, since the
 * colour function is sampled over its own range. The steps of `previous` are
 * then kept and only the mapping from value to step is new. A threshold or
 * an opacity that changes moves the opacity texels, so only the alpha steps
 * are made again.
 *
 * @internal
 */
export function getColourTables(
  appearanceActor: Pick<PlanarCpuSliceActor, 'actor' | 'mapper'>,
  previous?: PlanarSliceColourTables
): PlanarSliceColourTables {
  const property = appearanceActor.actor.getProperty();
  const nearest =
    property.getInterpolationType() ===
    (InterpolationType.NEAREST as unknown as ReturnType<
      typeof property.getInterpolationType
    >);
  const opacity = property.getOpacity();
  const colourWidth = appearanceActor.mapper.getColorTextureWidth();
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

  const opacityWidth = appearanceActor.mapper.getOpacityTextureWidth();
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

  const sameFilter = previous?.nearest === nearest;
  const sameAlphas =
    sameFilter &&
    previous.opacity === opacity &&
    isSameArray(previous.opacityTexels, opacityTexels);
  const alphaSteps = sameAlphas
    ? previous
    : getAlphaSteps(opacityTexels, opacity, nearest);

  return {
    colourTexels,
    opacityTexels,
    colours:
      sameFilter && isSameArray(previous.colourTexels, colourTexels)
        ? previous.colours
        : getColourSteps(colourTexels, nearest),
    colourScale,
    colourOffset,
    alphas: alphaSteps.alphas,
    alphaFractions: alphaSteps.alphaFractions,
    alphaScale,
    alphaOffset,
    nearest,
    opacity,
  };
}

/** Whether two arrays hold the same values, one by one. */
function isSameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
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

/**
 * The alpha of each step of an opacity table, 0 to 255 and rounded, and 0 to
 * 1 before any rounding.
 */
function getAlphaSteps(
  texels: Float32Array,
  opacity: number,
  nearest: boolean
): Pick<PlanarSliceColourTables, 'alphas' | 'alphaFractions'> {
  const values = getTextureSteps(texels, 1, 0, nearest);
  const alphas = new Uint8ClampedArray(values.length);
  const alphaFractions = new Float32Array(values.length);

  for (let step = 0; step < alphas.length; step++) {
    alphas[step] = 255 * opacity * values[step];
    alphaFractions[step] = opacity * values[step];
  }

  return { alphas, alphaFractions };
}

/**
 * Colours the values of a slice with the tables of `getColourTables` into
 * RGBA pixels, one 32-bit word per pixel in the byte order of ImageData.
 *
 * @internal
 */
export function colourSlice(
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
 * Colours a slice of whole numbers in an integer array, of fewer distinct
 * values than pixels and at most MAX_VALUE_TABLE_SIZE of them, through a table
 * of the colour of each value from the lowest to the highest of the slice.
 * The table is made by `colourSlice`, so each pixel gets the colour that
 * `colourSlice` gives it, with one table read per pixel in place of the
 * arithmetic of each pixel.
 *
 * It relies on `min` and `max` of the slice being the lowest and the highest
 * value of its pixel data. A pixel with a value outside them has no entry in
 * the table: the colouring then stops and returns false, so that the caller
 * colours the whole slice with `colourSlice`.
 *
 * @returns false for any other slice, which it leaves uncoloured or partly
 *   coloured
 * @internal
 */
export function colourWholeNumbers(
  slice: Pick<PlanarCpuSlice, 'pixelData' | 'min' | 'max'>,
  pixels: Uint32Array,
  tables: PlanarSliceColourTables
): boolean {
  const { pixelData, min, max } = slice;
  const count = max - min + 1;

  if (
    pixelData instanceof Float32Array ||
    pixelData instanceof Float64Array ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    !(count > 0 && count <= MAX_VALUE_TABLE_SIZE && count < pixels.length)
  ) {
    return false;
  }

  const values = new Int32Array(count);
  const table = new Uint32Array(count);

  for (let index = 0; index < count; index++) {
    values[index] = min + index;
  }

  colourSlice(values, table, tables);

  for (let index = 0; index < pixels.length; index++) {
    const colour = table[pixelData[index] - min];

    if (colour === undefined) {
      return false;
    }

    pixels[index] = colour;
  }

  return true;
}

/**
 * Colours the pixels of a colour slice as the vtk.js image mapper colours an
 * image of three dependent components: red, green and blue each read the red
 * of the colour table at their own value, and the alpha is the opacity of the
 * property. A fourth component is left out, as vtk.js leaves it out of the
 * texture of an image.
 *
 * @internal
 */
export function colourChannels(
  pixelData: PixelDataTypedArray,
  pixels: Uint32Array,
  tables: PlanarSliceColourTables,
  numberOfComponents: number
): void {
  const { colours, colourScale, colourOffset } = tables;
  const lastColour = colours.length - 1;
  const alpha = Math.round(255 * tables.opacity) << 24;

  for (let index = 0; index < pixels.length; index++) {
    let pixel = alpha;

    for (let channel = 0; channel < 3; channel++) {
      let step =
        pixelData[index * numberOfComponents + channel] * colourScale +
        colourOffset;

      step = step > 0 ? (step < lastColour ? step : lastColour) : 0;
      pixel |= (colours[(step + 0.5) | 0] & 0xff) << (channel * 8);
    }

    pixels[index] = pixel;
  }
}

/**
 * The first and the last column of a row of a slice whose point at `sample`
 * of the pixel, from its top left corner, lies inside every plane. The run is
 * found from the distance of that point of the first pixel to each plane and
 * the change of that distance along the row; it is empty when the first is
 * after the last.
 */
function getInsideRun(
  slice: PlanarCpuSlice,
  planes: PlanarSliceClipPlane[],
  row: number,
  sample: Point2
): Point2 {
  const { width, origin, xDirection, yDirection, spacing } = slice;
  const column = sample[0] - 0.5;
  const rowPosition = row + sample[1] - 0.5;
  let first = 0;
  let last = width - 1;

  for (const plane of planes) {
    let distance = 0;
    let step = 0;

    for (let axis = 0; axis < 3; axis++) {
      distance +=
        (origin[axis] +
          xDirection[axis] * spacing[0] * column +
          yDirection[axis] * spacing[1] * rowPosition -
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

  return [first, last];
}

/**
 * The pixels of a slice on an edge that the slice covers in part: the index
 * of each pixel, the share of it that the slice covers, and the values that
 * it shows, `numberOfComponents` of the slice for each pixel.
 */
type PlanarSliceEdgePixels = {
  indices: number[];
  coverage: number[];
  values: Float64Array;
};

/**
 * The values that the GPU shows on the pixels of a slice whose centre lies
 * outside the faces, kept for each slice and pixel index: they do not change
 * with the colours.
 */
const valuesOnVoxelCentres = new WeakMap<
  PlanarCpuSlice,
  Map<number, Float64Array>
>();

/**
 * The values of a pixel of a slice whose centre lies outside the faces of the
 * volume, as the GPU shows them on a pixel of the multisampled edge of its
 * quad: it reads the texture at the centre of the pixel, and the texture is
 * clamped to its edge, so it reads the point that the centre gives once moved
 * onto the range of the voxel centres, with the interpolation of the slice.
 * Along a face this point moves with the pixel, unlike the centre of a
 * neighbour pixel inside.
 */
function getValuesOnVoxelCentres(
  volume: IImageVolume,
  slice: PlanarCpuSlice,
  index: number
): Float64Array {
  let kept = valuesOnVoxelCentres.get(slice);

  if (!kept) {
    kept = new Map();
    valuesOnVoxelCentres.set(slice, kept);
  }

  let values = kept.get(index);

  if (values) {
    return values;
  }

  const { width, origin, xDirection, yDirection, spacing } = slice;
  const column = index % width;
  const row = (index - column) / width;
  const centre = [0, 1, 2].map(
    (axis) =>
      origin[axis] +
      xDirection[axis] * spacing[0] * column +
      yDirection[axis] * spacing[1] * row
  ) as Point3;
  const voxelIndex = transformWorldToIndexContinuous(volume.imageData, centre);

  values = new Float64Array(slice.numberOfComponents ?? 1);
  sampleVolumeGrid({
    volume,
    pixelData: values,
    numberOfComponents: values.length,
    width: 1,
    height: 1,
    startIndex: [0, 1, 2].map((axis) =>
      Math.min(Math.max(voxelIndex[axis], 0), volume.dimensions[axis] - 1)
    ) as Point3,
    columnStep: [0, 0, 0],
    rowStep: [0, 0, 0],
    interpolationType: slice.sampledFor.interpolationType,
  });
  kept.set(index, values);

  return values;
}

/**
 * Clears the pixels of a slice that lie outside the faces of the volume as
 * the GPU draw step leaves them. With CENTRE_SAMPLE, a pixel whose centre
 * lies outside one face is cleared, which is what the clip planes of the GPU
 * draw step discard. With EDGE_SAMPLES, a pixel with none of its sample points
 * inside is cleared, and a pixel with some of them inside keeps that share of
 * its alpha, as a multisampled edge of a quad on the GPU. The GPU colours
 * such a pixel at its centre from a texture clamped to its edge, so a pixel
 * whose centre lies outside shows the colour of the values at its centre
 * moved onto the voxel centres (`getValuesOnVoxelCentres`), coloured with
 * the tables of the slice. A slab is drawn on the GPU volume path
 * (`hasSlab`), whose shader shows nothing of the slab on a pixel whose centre
 * lies outside the volume, so such a pixel of a slab is cleared.
 *
 * @returns the pixels that the slice covers in part, or undefined for none
 */
function clearOutsideVolume(
  slice: PlanarCpuSlice,
  planes: PlanarSliceClipPlane[],
  pixels: Uint32Array,
  samples: Point2[],
  volume: IImageVolume,
  tables: PlanarSliceColourTables
): PlanarSliceEdgePixels | undefined {
  const { width, height, pixelData } = slice;
  const numberOfComponents = slice.numberOfComponents ?? 1;
  const isSlab = hasSlab(volume, slice.sampledFor.slab?.thickness);
  const centreRuns = Array.from({ length: height }, (_, row) =>
    getInsideRun(slice, planes, row, CENTRE_SAMPLE[0])
  );
  const isCentreInside = (column: number, row: number) =>
    row >= 0 &&
    row < height &&
    column >= centreRuns[row][0] &&
    column <= centreRuns[row][1];
  const edges: Omit<PlanarSliceEdgePixels, 'values'> = {
    indices: [],
    coverage: [],
  };
  const centreInside: boolean[] = [];

  for (let row = 0; row < height; row++) {
    const runs =
      samples === CENTRE_SAMPLE
        ? [centreRuns[row]]
        : samples.map((sample) => getInsideRun(slice, planes, row, sample));
    const first = Math.min(...runs.map(([start]) => start));
    const last = Math.max(...runs.map(([, end]) => end));
    const wholeFirst = Math.max(...runs.map(([start]) => start));
    const wholeLast = Math.min(...runs.map(([, end]) => end));
    const rowStart = row * width;

    if (first > last) {
      pixels.fill(0, rowStart, rowStart + width);
      continue;
    }

    pixels.fill(0, rowStart, rowStart + first);
    pixels.fill(0, rowStart + last + 1, rowStart + width);

    for (let column = first; column <= last; column++) {
      if (column === wholeFirst && wholeFirst <= wholeLast) {
        column = wholeLast;
        continue;
      }

      const inside = runs.filter(
        ([start, end]) => column >= start && column <= end
      ).length;

      if (inside === samples.length) {
        continue;
      }

      if (isSlab && !isCentreInside(column, row)) {
        pixels[rowStart + column] = 0;
        continue;
      }

      edges.indices.push(rowStart + column);
      edges.coverage.push(inside / samples.length);
      centreInside.push(isCentreInside(column, row));
    }
  }

  if (!edges.indices.length) {
    return;
  }

  const values = new Float64Array(edges.indices.length * numberOfComponents);
  const colours = new Uint32Array(edges.indices.length);

  edges.indices.forEach((index, entry) => {
    values.set(
      centreInside[entry]
        ? pixelData.subarray(
            index * numberOfComponents,
            (index + 1) * numberOfComponents
          )
        : getValuesOnVoxelCentres(volume, slice, index),
      entry * numberOfComponents
    );
  });

  if (numberOfComponents > 1) {
    colourChannels(values, colours, tables, numberOfComponents);
  } else {
    colourSlice(values, colours, tables);
  }

  edges.indices.forEach((index, entry) => {
    pixels[index] =
      (colours[entry] & 0xffffff) |
      (Math.round((colours[entry] >>> 24) * edges.coverage[entry]) << 24);
  });

  return { ...edges, values };
}

/**
 * The alpha of each pixel of a coloured slice, from 0 to 1 before any
 * rounding, which the GPU blends with: the alpha of the opacity table at its
 * value, or the opacity of the appearance for a colour slice, times the
 * share of the pixel that the slice covers for a pixel on an edge.
 */
function getSliceAlphas(
  slice: PlanarCpuSlice,
  tables: PlanarSliceColourTables,
  edges: PlanarSliceEdgePixels | undefined
): Float32Array {
  const { pixelData } = slice;
  const manyComponents = (slice.numberOfComponents ?? 1) > 1;
  const { alphaFractions, alphaScale, alphaOffset, opacity } = tables;
  const lastAlpha = alphaFractions.length - 1;
  const alphas = new Float32Array(slice.width * slice.height);
  const alphaOf = (value: number) => {
    if (manyComponents) {
      return opacity;
    }

    let step = value * alphaScale + alphaOffset;

    step = step > 0 ? (step < lastAlpha ? step : lastAlpha) : 0;

    return alphaFractions[(step + 0.5) | 0];
  };

  for (let index = 0; index < alphas.length; index++) {
    alphas[index] = alphaOf(pixelData[index]);
  }

  edges?.indices.forEach((index, entry) => {
    alphas[index] = alphaOf(edges.values[entry]) * edges.coverage[entry];
  });

  return alphas;
}

/**
 * Whether a coloured slice has a pixel that is neither clear nor opaque. Only
 * such a pixel moves when the canvas blends it with its alpha of 8 bits.
 */
function hasTranslucentPixel(pixels: Uint32Array): boolean {
  for (let index = 0; index < pixels.length; index++) {
    const alpha = pixels[index] >>> 24;

    if (alpha && alpha !== 255) {
      return true;
    }
  }

  return false;
}

/** Whether a transform of `getSliceCanvasTransform` is the identity. */
function isIdentityTransform(transform: PlanarSliceCanvasTransform): boolean {
  return [1, 0, 0, 1, 0, 0].every((value, index) => transform[index] === value);
}

/**
 * Draws a coloured slice over the canvas of the viewport as the GPU blends a
 * layer: each canvas pixel becomes `colour * alpha + below * (1 - alpha)`,
 * rounded once, with the alpha of `getSliceAlphas`. The canvas keeps an alpha
 * of 8 bits per pixel, which moves a pixel under a translucent layer by a
 * level from the GPU picture: an alpha of 0.0024 is kept as 1 / 255. Each
 * canvas pixel takes the slice pixel under its centre, as a nearest texture
 * read of the GPU, so a slice drawn one to one or with NEAREST interpolation
 * is drawn here. A clear pixel of the slice, such as one outside the faces of
 * the volume, leaves the canvas as it is.
 */
function blendSlice(
  target: PlanarCanvasTarget,
  slice: Pick<PlanarCpuSlice, 'width' | 'height'>,
  sliceImageData: ImageData,
  alphas: Float32Array,
  transform: PlanarSliceCanvasTransform
): void {
  const { canvas, context } = target;
  const { width, height } = slice;
  const colours = sliceImageData.data;
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;

  if (!determinant) {
    return;
  }

  const below = context.getImageData(0, 0, canvas.width, canvas.height);
  const blended = below.data;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = x + 0.5 - e;
      const dy = y + 0.5 - f;
      const column = Math.floor((d * dx - c * dy) / determinant);
      const row = Math.floor((a * dy - b * dx) / determinant);

      if (column < 0 || row < 0 || column >= width || row >= height) {
        continue;
      }

      const index = row * width + column;

      if (!colours[index * 4 + 3]) {
        continue;
      }

      const alpha = alphas[index];
      const out = (y * canvas.width + x) * 4;

      for (let channel = 0; channel < 3; channel++) {
        blended[out + channel] = Math.round(
          colours[index * 4 + channel] * alpha +
            blended[out + channel] * (1 - alpha)
        );
      }
    }
  }

  context.putImageData(below, 0, 0);
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
