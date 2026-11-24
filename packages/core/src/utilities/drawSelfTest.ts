import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { vtkOffscreenMultiRenderWindow } from '../RenderingEngine/vtkClasses';
import { getTextureFormatName } from '../RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper';
import copyWebGLCanvasToCanvas from '../RenderingEngine/helpers/copyWebGLCanvasToCanvas';
import { applyPlanarVolumePresentation } from '../RenderingEngine/Viewports/Planar/planarVolumePresentation';
import { InterpolationType } from '../enums';
import { getCanUseNorm16Texture } from '../init';
import type { VOIRange } from '../types';
import type { RenderingCapabilities } from './renderingCapabilities';
import { getRenderingCapabilities } from './renderingCapabilities';
import type { TextureProbeReport } from './textureSupport';
import { probeTextureFormats } from './textureSupport';

/** The array types the self-test draws. */
export type DrawSelfTestDataType = 'Int16' | 'Uint16' | 'Float32';

/** The filter that WebGL sampled a texture with. */
export type DrawSelfTestFilter = 'linear' | 'nearest';

/** One draw of a test image and what came back. */
export interface DrawSelfTestDraw {
  name: string;
  voiRange: VOIRange;
  /** Screen pixels per image pixel: 1 for the ramp, more for the filter check. */
  zoom: number;
  /** The texture format of this draw (see `DrawSelfTestCase.textureFormat`). */
  textureFormat: string;
  /** The filter that WebGL sampled the texture of this draw with. */
  filter: DrawSelfTestFilter;
  /** Largest difference from the expected grey level, in grey levels of 255. */
  maxError: number;
  pixelsOff: number;
  pixelsChecked: number;
}

/** The self-test of one array type. */
export interface DrawSelfTestCase {
  dataType: DrawSelfTestDataType;
  passed: boolean;
  /**
   * The texture format that vtk.js chose for the image: 'R16_SNORM', 'R16',
   * 'R32F', 'R16F', or 'unknown'.
   */
  textureFormat: string;
  /**
   * What the stored capability profile says about that format with the
   * filter that cornerstone uses for it on this device. False means the GPU
   * cannot draw this image correctly.
   */
  formatUsable: boolean;
  /**
   * The filter that the image was drawn with. 'nearest' for a 32-bit float
   * texture on a device that cannot filter float textures: cornerstone then
   * promises the right values, not smoothed.
   */
  filter: DrawSelfTestFilter;
  /** A plain sentence when the case was judged by another promise than usual. */
  note?: string;
  maxError: number;
  pixelsOff: number;
  pixelsChecked: number;
  draws: DrawSelfTestDraw[];
  error?: string;
}

/**
 * The check of the copy that puts a picture on screen: a rendering engine
 * draws with WebGL on a canvas of its own and copies each viewport from
 * there into the 2D canvas of that viewport.
 */
export interface DrawSelfTestScreenCopy {
  /**
   * 'drawImage' is the copy every browser is expected to do. 'readPixels' is
   * the slower copy that replaces it when the capability profile measured
   * that `drawImage` hands back an empty picture.
   */
  method: 'drawImage' | 'readPixels';
  passed: boolean;
  /** Largest difference between the copy and what WebGL drew, in grey levels. */
  maxError: number;
  pixelsOff: number;
  pixelsChecked: number;
}

/** The result of {@link runDrawSelfTest}. */
export interface DrawSelfTestResult {
  passed: boolean;
  /** Time of the whole self-test, probe included, in milliseconds. */
  durationMs: number;
  /** Time of the texture probe in milliseconds. */
  probeDurationMs: number;
  /** Largest difference in grey levels that passes. */
  maxGreyError: number;
  /** True when cornerstone render windows hide EXT_texture_norm16 (probe failed). */
  norm16Hidden: boolean;
  /** The stored capability profile, which the render windows follow. */
  capabilities: RenderingCapabilities;
  /** A fresh run of the texture probe with the result of each probe, or null. */
  probe: TextureProbeReport | null;
  /** MAX_TEXTURE_SIZE of the render window context, 0 when unknown. */
  maxTextureSize: number;
  /** MAX_3D_TEXTURE_SIZE of the render window context, 0 when unknown. */
  max3DTextureSize: number;
  cases: DrawSelfTestCase[];
  /** Null when the browser gives no 2D canvas to copy into. */
  screenCopy: DrawSelfTestScreenCopy | null;
  error?: string;
}

/** Options of {@link runDrawSelfTest}. */
export interface DrawSelfTestOptions {
  dataTypes?: DrawSelfTestDataType[];
  /** Largest difference in grey levels that passes. Default 1. */
  maxGreyError?: number;
  /** Runs the texture probe as well. Default true. */
  probe?: boolean;
}

/**
 * One band of rows of the ramp image: the pixel in column x holds
 * `base + x * step`. A draw with the window `base` to `base + 255 * step`
 * gives grey level x, so a band with step 1 shows every bit of the values.
 */
interface RampBand {
  base: number;
  step: number;
}

const RAMP_WIDTH = 256;
const BAND_HEIGHT = 2;
const FILTER_ZOOM = 32;
const DEFAULT_MAX_GREY_ERROR = 1;
const ALL_DATA_TYPES: DrawSelfTestDataType[] = ['Int16', 'Uint16', 'Float32'];

/**
 * The bands of each array type: the full range in steps of 257, the
 * extremes, and the CT (or PT) range in steps of one.
 */
const RAMP_BANDS: Record<DrawSelfTestDataType, RampBand[]> = {
  Int16: [
    { base: -32768, step: 257 },
    { base: -32768, step: 1 },
    { base: -1024, step: 1 },
    { base: -128, step: 1 },
    { base: 1000, step: 1 },
    { base: 2900, step: 1 },
    { base: 32512, step: 1 },
  ],
  Uint16: [
    { base: 0, step: 257 },
    { base: 0, step: 1 },
    { base: 1000, step: 1 },
    { base: 3840, step: 1 },
    { base: 32640, step: 1 },
    { base: 65280, step: 1 },
  ],
  Float32: [
    { base: 0, step: 400 },
    { base: -1.28, step: 0.01 },
    { base: 0, step: 0.1 },
    { base: 1000, step: 1 },
  ],
};

/**
 * The pairs of values of the filter checks: 255 units apart, so one grey
 * level per unit. The second Float32 pair lies outside plus or minus 2048,
 * so vtk.js cannot hold it in a half float texture: it checks a 32-bit float
 * texture also on a device that holds the first pair as half float.
 */
const FILTER_PAIRS: Record<DrawSelfTestDataType, Array<[number, number]>> = {
  Int16: [[-1024, -769]],
  Uint16: [[1000, 1255]],
  Float32: [
    [0, 2.55],
    [3000, 3002.55],
  ],
};

const ARRAY_TYPES = {
  Int16: Int16Array,
  Uint16: Uint16Array,
  Float32: Float32Array,
};

const NEAREST_FLOAT_NOTE =
  'right values, not smoothed on this device, because it cannot filter float textures';

type TestImage = {
  imageData: vtkImageData;
  values: ArrayLike<number>;
  width: number;
  height: number;
};

type SelfTestRenderer = {
  offscreen: ReturnType<typeof vtkOffscreenMultiRenderWindow.newInstance>;
  renderer: ReturnType<
    ReturnType<typeof vtkOffscreenMultiRenderWindow.newInstance>['getRenderer']
  >;
};

/** Builds a vtkImageData of the given array type at the origin, spacing 1. */
function createTestImage(
  dataType: DrawSelfTestDataType,
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number
): TestImage {
  const values = new ARRAY_TYPES[dataType](width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values[y * width + x] = valueAt(x, y);
    }
  }

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(width, height, 1);
  imageData.setSpacing([1, 1, 1]);
  imageData.setOrigin([0, 0, 0]);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values,
    })
  );

  return { imageData, values, width, height };
}

/** The ramp image: one band of `BAND_HEIGHT` rows per entry of `RAMP_BANDS`. */
function createRampImage(dataType: DrawSelfTestDataType): TestImage {
  const bands = RAMP_BANDS[dataType];

  return createTestImage(
    dataType,
    RAMP_WIDTH,
    bands.length * BAND_HEIGHT,
    (x, y) => {
      const band = bands[Math.floor(y / BAND_HEIGHT)];

      return band.base + x * band.step;
    }
  );
}

/**
 * The grey level that a value must give with a linear window: the window maps
 * `lower` to 0 and `upper` to 255.
 */
export function getExpectedGreyLevel(
  value: number,
  voiRange: VOIRange
): number {
  const fraction = (value - voiRange.lower) / (voiRange.upper - voiRange.lower);

  return 255 * Math.min(1, Math.max(0, fraction));
}

/**
 * The value that a linear filter must give at the centre of screen column
 * `column` when two texels `a` and `b` side by side are drawn `zoom` times
 * enlarged.
 */
export function getFilteredValue(
  a: number,
  b: number,
  column: number,
  zoom: number
): number {
  const weight = Math.min(1, Math.max(0, (column + 0.5) / zoom - 0.5));

  return a + (b - a) * weight;
}

/**
 * The value that nearest filtering must give at the centre of screen column
 * `column` when two texels `a` and `b` side by side are drawn `zoom` times
 * enlarged: `a` over the first texel, `b` over the second.
 */
export function getNearestValue(
  a: number,
  b: number,
  column: number,
  zoom: number
): number {
  return column < zoom ? a : b;
}

/**
 * The filter that cornerstone promises for a texture format on a device:
 * nearest for a 32-bit float texture when the device cannot filter float
 * textures, linear for every other format.
 */
export function getPromisedFilter(
  textureFormat: string,
  capabilities: Pick<RenderingCapabilities, 'floatLinear'>
): DrawSelfTestFilter {
  return textureFormat === 'R32F' && !capabilities.floatLinear
    ? 'nearest'
    : 'linear';
}

/**
 * Compares RGBA pixels read from the bottom row up with the grey levels
 * expected for each pixel.
 */
export function compareGreyLevels(
  pixels: Uint8Array,
  expected: (column: number, row: number) => number,
  width: number,
  height: number,
  maxGreyError: number
): { maxError: number; pixelsOff: number; pixelsChecked: number } {
  let maxError = 0;
  let pixelsOff = 0;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4;
      const grey = expected(column, row);
      const error = Math.max(
        Math.abs(pixels[offset] - grey),
        Math.abs(pixels[offset + 1] - grey),
        Math.abs(pixels[offset + 2] - grey)
      );

      maxError = Math.max(maxError, error);

      if (error > maxGreyError) {
        pixelsOff++;
      }
    }
  }

  return { maxError, pixelsOff, pixelsChecked: width * height };
}

/**
 * Creates the offscreen render window of the self-test: a cornerstone
 * render window (one WebGL context of its own) with one renderer.
 */
function createSelfTestRenderer(): SelfTestRenderer {
  const offscreen = vtkOffscreenMultiRenderWindow.newInstance();

  offscreen.setContainer(document.createElement('div'));
  offscreen.addRenderer({
    viewport: [0, 0, 1, 1],
    id: 'drawSelfTest',
    background: [0, 0, 0],
  });

  return { offscreen, renderer: offscreen.getRenderer('drawSelfTest') };
}

/** Reads the largest 2D and 3D texture sizes of the self-test context. */
function readTextureLimits({
  offscreen,
}: SelfTestRenderer): Pick<
  DrawSelfTestResult,
  'maxTextureSize' | 'max3DTextureSize'
> {
  const context = offscreen
    .getOpenGLRenderWindow()
    .getContext?.() as WebGL2RenderingContext;

  if (!context) {
    return { maxTextureSize: 0, max3DTextureSize: 0 };
  }

  return {
    maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || 0,
    max3DTextureSize:
      Number(context.getParameter(context.MAX_3D_TEXTURE_SIZE)) || 0,
  };
}

/**
 * Releases the textures and the WebGL context of the self-test window at
 * once, so the context does not wait for garbage collection.
 */
function releaseSelfTestRenderer({ offscreen }: SelfTestRenderer): void {
  const openGLRenderWindow = offscreen.getOpenGLRenderWindow();
  const context = openGLRenderWindow.getContext?.();

  openGLRenderWindow.releaseGraphicsResources();
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  offscreen.delete();
}

/**
 * Draws an image with a parallel camera so that one image pixel covers
 * `zoom` by `zoom` screen pixels exactly, and reads the pixels back.
 */
function drawAndRead(
  selfTest: SelfTestRenderer,
  actor: vtkImageSlice,
  mapper: vtkImageMapper,
  image: TestImage,
  voiRange: VOIRange,
  zoom: number
): Uint8Array {
  const { offscreen, renderer } = selfTest;
  const width = image.width * zoom;
  const height = image.height * zoom;
  const centerX = (image.width - 1) / 2;
  const centerY = (image.height - 1) / 2;
  const camera = renderer.getActiveCamera();

  if (mapper.getInputData() !== image.imageData) {
    mapper.setInputData(image.imageData);
  }

  applyPlanarVolumePresentation({
    actor,
    mapper,
    props: { voiRange, interpolationType: InterpolationType.LINEAR },
  });

  camera.setParallelProjection(true);
  camera.setFocalPoint(centerX, centerY, 0);
  camera.setPosition(centerX, centerY, 10);
  camera.setViewUp(0, 1, 0);
  camera.setParallelScale(height / (2 * zoom));
  camera.setClippingRange(1, 20);

  offscreen.getOpenGLRenderWindow().setSize(width, height);
  offscreen.getRenderWindow().render();

  return offscreen
    .getOpenGLRenderWindow()
    .getPixelData(0, 0, width - 1, height - 1);
}

/**
 * Names the internal format of the texture that vtk.js made for the mapper,
 * and the filter that WebGL samples it with.
 */
function getMapperTexture(
  selfTest: SelfTestRenderer,
  mapper: vtkImageMapper
): { textureFormat: string; filter: DrawSelfTestFilter } {
  const openGLRenderWindow = selfTest.offscreen.getOpenGLRenderWindow();
  const openGLMapper = openGLRenderWindow.getViewNodeFor(mapper);
  const texture = openGLMapper?.getReferenceByName?.('openGLTexture');
  const context = openGLRenderWindow.getContext?.() as WebGL2RenderingContext;
  const filter = texture?.getOpenGLFilterMode?.(
    texture.getMagnificationFilter()
  );

  return {
    textureFormat: getTextureFormatName(
      texture?.getReferenceByName?.('internalFormat')
    ),
    filter: context && filter === context.NEAREST ? 'nearest' : 'linear',
  };
}

/**
 * Whether the capability profile says a format works with the filter that
 * cornerstone promises for it (see {@link getPromisedFilter}).
 */
function isFormatUsable(
  textureFormat: string,
  capabilities: RenderingCapabilities
): boolean {
  switch (textureFormat) {
    case 'R16_SNORM':
    case 'R16':
      return capabilities.norm16Linear;
    case 'R32F':
      return getPromisedFilter(textureFormat, capabilities) === 'nearest'
        ? capabilities.float
        : capabilities.floatLinear;
    case 'R16F':
      return capabilities.halfFloatLinear;
    default:
      return false;
  }
}

/** Formats a window value for the name of a draw. */
function formatValue(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Runs the draws of one array type: the ramp 1:1 once per band, with the
 * window of that band, then each pair of `FILTER_PAIRS` side by side
 * enlarged, which checks the filter between them. That filter must be the one that cornerstone
 * promises for the texture of that draw on this device
 * ({@link getPromisedFilter}): linear, or nearest for a 32-bit float texture
 * on a device that cannot filter float textures. A wrong value fails either
 * way.
 */
function runSelfTestCase(
  selfTest: SelfTestRenderer,
  dataType: DrawSelfTestDataType,
  capabilities: RenderingCapabilities,
  maxGreyError: number
): DrawSelfTestCase {
  const mapper = vtkImageMapper.newInstance();
  const actor = vtkImageSlice.newInstance();
  const draws: DrawSelfTestDraw[] = [];
  const ramp = createRampImage(dataType);
  let textureFormat = 'unknown';
  let filter: DrawSelfTestFilter = 'linear';

  actor.setMapper(mapper);
  selfTest.renderer.addActor(actor);

  try {
    RAMP_BANDS[dataType].forEach(({ base, step }) => {
      const voiRange = { lower: base, upper: base + 255 * step };
      const pixels = drawAndRead(selfTest, actor, mapper, ramp, voiRange, 1);
      const texture = getMapperTexture(selfTest, mapper);

      textureFormat = texture.textureFormat;
      filter = texture.filter;
      draws.push({
        name: `1:1, window ${formatValue(voiRange.lower)} to ${formatValue(voiRange.upper)}`,
        voiRange,
        zoom: 1,
        ...texture,
        ...compareGreyLevels(
          pixels,
          (column, row) =>
            getExpectedGreyLevel(
              ramp.values[row * ramp.width + column],
              voiRange
            ),
          ramp.width,
          ramp.height,
          maxGreyError
        ),
      });
    });

    FILTER_PAIRS[dataType].forEach(([a, b]) => {
      draws.push(
        runFilterDraw(selfTest, actor, mapper, dataType, [a, b], {
          capabilities,
          maxGreyError,
        })
      );
    });
  } catch (error) {
    return summarizeCase(
      dataType,
      { textureFormat, filter },
      capabilities,
      draws,
      error
    );
  } finally {
    selfTest.renderer.removeActor(actor);
    mapper.delete();
    actor.delete();
  }

  return summarizeCase(
    dataType,
    { textureFormat, filter },
    capabilities,
    draws
  );
}

/**
 * Draws two values side by side enlarged `FILTER_ZOOM` times and compares
 * the pixels with the filter that cornerstone promises for the texture that
 * vtk.js made for them (see {@link getPromisedFilter}).
 */
function runFilterDraw(
  selfTest: SelfTestRenderer,
  actor: vtkImageSlice,
  mapper: vtkImageMapper,
  dataType: DrawSelfTestDataType,
  [a, b]: [number, number],
  {
    capabilities,
    maxGreyError,
  }: { capabilities: RenderingCapabilities; maxGreyError: number }
): DrawSelfTestDraw {
  const pair = createTestImage(dataType, 2, 2, (x) => (x === 0 ? a : b));
  const pairValues = [pair.values[0], pair.values[1]];
  const voiRange = { lower: pairValues[0], upper: pairValues[1] };
  const pixels = drawAndRead(
    selfTest,
    actor,
    mapper,
    pair,
    voiRange,
    FILTER_ZOOM
  );
  const texture = getMapperTexture(selfTest, mapper);
  const promisedFilter = getPromisedFilter(texture.textureFormat, capabilities);
  const expectedValue =
    promisedFilter === 'nearest' ? getNearestValue : getFilteredValue;

  return {
    name: `${promisedFilter} filter between ${formatValue(pairValues[0])} and ${formatValue(pairValues[1])}, ${FILTER_ZOOM}x`,
    voiRange,
    zoom: FILTER_ZOOM,
    ...texture,
    ...compareGreyLevels(
      pixels,
      (column) =>
        getExpectedGreyLevel(
          expectedValue(pairValues[0], pairValues[1], column, FILTER_ZOOM),
          voiRange
        ),
      pair.width * FILTER_ZOOM,
      pair.height * FILTER_ZOOM,
      maxGreyError
    ),
  };
}

/**
 * Draws the first band of the Int16 ramp, copies the picture from the WebGL
 * canvas into a 2D canvas the way a rendering engine puts a viewport on
 * screen, and compares the copy with the pixels that WebGL drew. Returns
 * null when the browser gives no 2D canvas to copy into.
 */
function runScreenCopyCheck(
  selfTest: SelfTestRenderer,
  capabilities: RenderingCapabilities,
  maxGreyError: number
): DrawSelfTestScreenCopy | null {
  const target = document.createElement('canvas');
  const context = target.getContext('2d');

  if (!context) {
    return null;
  }

  const mapper = vtkImageMapper.newInstance();
  const actor = vtkImageSlice.newInstance();
  const ramp = createRampImage('Int16');
  const { base, step } = RAMP_BANDS.Int16[0];
  const { width, height } = ramp;

  actor.setMapper(mapper);
  selfTest.renderer.addActor(actor);

  try {
    const drawn = drawAndRead(
      selfTest,
      actor,
      mapper,
      ramp,
      { lower: base, upper: base + 255 * step },
      1
    );
    const source = selfTest.offscreen.getOpenGLRenderWindow().getCanvas();

    target.width = width;
    target.height = height;
    copyWebGLCanvasToCanvas(
      context,
      source,
      0,
      source.height - height,
      width,
      height,
      0,
      0,
      width,
      height
    );

    const comparison = compareGreyLevels(
      context.getImageData(0, 0, width, height).data as unknown as Uint8Array,
      (column, row) => drawn[((height - 1 - row) * width + column) * 4],
      width,
      height,
      maxGreyError
    );

    return {
      method: capabilities.webglCanvasCopy ? 'drawImage' : 'readPixels',
      passed: comparison.pixelsOff === 0,
      ...comparison,
    };
  } finally {
    selfTest.renderer.removeActor(actor);
    mapper.delete();
    actor.delete();
  }
}

/**
 * Sums the draws of one array type into its result. The texture is the one
 * of the ramp draws.
 */
function summarizeCase(
  dataType: DrawSelfTestDataType,
  texture: { textureFormat: string; filter: DrawSelfTestFilter },
  capabilities: RenderingCapabilities,
  draws: DrawSelfTestDraw[],
  error?: unknown
): DrawSelfTestCase {
  const pixelsOff = draws.reduce((sum, draw) => sum + draw.pixelsOff, 0);
  const { textureFormat, filter } = texture;

  return {
    dataType,
    passed: !error && draws.length > 0 && pixelsOff === 0,
    textureFormat,
    filter,
    note:
      getPromisedFilter(textureFormat, capabilities) === 'nearest'
        ? NEAREST_FLOAT_NOTE
        : undefined,
    formatUsable: isFormatUsable(textureFormat, capabilities),
    maxError: draws.reduce((max, draw) => Math.max(max, draw.maxError), 0),
    pixelsOff,
    pixelsChecked: draws.reduce((sum, draw) => sum + draw.pixelsChecked, 0),
    draws,
    error: error ? String((error as Error)?.message ?? error) : undefined,
  };
}

/**
 * Draws known 16-bit and float test images through the classes that draw a
 * slice on the GPU (a `vtkImageData`, `vtkImageMapper`, `vtkImageSlice` with
 * the linear window of `applyPlanarVolumePresentation`, rendered by a
 * cornerstone render window offscreen), reads the pixels back and compares
 * them with the grey levels that the values must give.
 *
 * For each array type it draws a ramp 1:1 (the full range, the extremes and
 * the CT or PT range, with windows that give one grey level per unit) and two
 * values enlarged, which checks linear filtering between them. On a device
 * that cannot filter float textures, a 32-bit float texture is checked for
 * what cornerstone promises there: the right values, not smoothed (the case
 * says so in `filter` and `note`). It then checks
 * the copy that puts a picture on screen (`screenCopy`), and it runs the
 * texture probe again and reports each probe.
 *
 * It runs only when called. It takes two WebGL contexts one after the other,
 * never at the same time: the probe context, then the render window, each
 * released as soon as its part is done (tens of milliseconds on a desktop
 * GPU). The render window is its own, not one of a rendering engine, so the
 * viewports of the page are not touched. A page that already holds as many
 * contexts as the browser allows can lose its oldest one, as with any new
 * context.
 *
 * @experimental
 */
export async function runDrawSelfTest(
  options: DrawSelfTestOptions = {}
): Promise<DrawSelfTestResult> {
  const start = performance.now();
  const maxGreyError = options.maxGreyError ?? DEFAULT_MAX_GREY_ERROR;
  const dataTypes = options.dataTypes ?? ALL_DATA_TYPES;
  const capabilities = getRenderingCapabilities();
  const probe = options.probe === false ? null : probeTextureFormats();
  const probeDurationMs = performance.now() - start;
  const result: DrawSelfTestResult = {
    passed: false,
    durationMs: 0,
    probeDurationMs,
    maxGreyError,
    norm16Hidden: !getCanUseNorm16Texture(),
    capabilities,
    probe,
    maxTextureSize: 0,
    max3DTextureSize: 0,
    cases: [],
    screenCopy: null,
  };

  if (!capabilities.webgl) {
    result.error = 'WebGL2 is not available.';
    result.durationMs = performance.now() - start;

    return result;
  }

  let selfTest: SelfTestRenderer | undefined;

  try {
    selfTest = createSelfTestRenderer();

    for (const dataType of dataTypes) {
      result.cases.push(
        runSelfTestCase(selfTest, dataType, capabilities, maxGreyError)
      );
    }

    result.screenCopy = runScreenCopyCheck(
      selfTest,
      capabilities,
      maxGreyError
    );
  } catch (error) {
    result.error = String((error as Error)?.message ?? error);
  } finally {
    if (selfTest) {
      Object.assign(result, readTextureLimits(selfTest));
      releaseSelfTestRenderer(selfTest);
    }
  }

  result.passed =
    !result.error &&
    result.cases.length > 0 &&
    result.cases.every((testCase) => testCase.passed) &&
    (result.screenCopy?.passed ?? true);
  result.durationMs = performance.now() - start;

  return result;
}
