import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  countContentPixels,
  countPixelsDifferingBy,
  readViewportPixels,
} from '../utils/viewportPixels';

const EXAMPLE = 'genericStackAPI';
const ENGINE_ID = 'myRenderingEngine';
const EXAMPLE_VIEWPORT_ID = 'CT_STACK_GENERIC';
const NEAREST = 0;
const LINEAR = 1;
/** The background of every case that does not choose its own. */
const BACKGROUND: [number, number, number] = [0.2, 0.1, 0.3];
/** A pixel of the outline of the image lies this close to an edge of it. */
const OUTLINE_DISTANCE = 1.5;
/** The part of the canvas that must be content, not background. */
const MIN_CONTENT_FRACTION = 0.05;
const LOAD_TIMEOUT_MS = 120000;

/**
 * How closely the CPU picture must follow the GPU picture, away from the
 * outline of the image, where the GPU draws the edge of its quad: the parts
 * of the canvas that may differ by more than 1 level and by more than 8
 * levels in a channel. The area outside the image counts, so it must have the
 * background colour on both.
 */
type Tolerance = { overOne: number; overEight: number };

/** No pixel differs by more than 1 level, apart from a few. */
const EXACT: Tolerance = { overOne: 0.0002, overEight: 0 };

/**
 * The GPU reads its textures with less precision than the exact linear sample
 * of the CPU. Where the picture changes by many levels from one pixel to the
 * next and the image is sampled between its pixels (a pan, a rotation, a
 * flip, a zoom out, the steep hsv colours) that gives a few levels.
 */
const GPU_FILTERING: Tolerance = { overOne: 0.015, overEight: 0.0002 };

type StackView = {
  zoom?: number;
  pan?: [number, number];
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};

type StackCase = {
  name: string;
  image: string;
  tolerance: Tolerance;
  background?: [number, number, number];
  presentation?: Record<string, unknown>;
  view?: StackView;
  overlay?: { image: string; presentation?: Record<string, unknown> };
};

/** The image of the example, a CT of the stack loaded from the server. */
const EXAMPLE_CT = 'exampleCT';

/** The cases of each kind of image: its array type, pixels and size. */
const IMAGE_CASES: StackCase[] = [
  { name: '16-bit CT', image: 'ct16', tolerance: EXACT },
  {
    name: '16-bit CT on a black background',
    image: 'ct16',
    tolerance: EXACT,
    background: [0, 0, 0],
  },
  { name: 'CT of the example', image: EXAMPLE_CT, tolerance: EXACT },
  { name: '8-bit image', image: 'u8', tolerance: EXACT },
  { name: 'RGB image', image: 'rgb', tolerance: EXACT },
  {
    name: 'RGB image, inverted',
    image: 'rgb',
    tolerance: EXACT,
    presentation: { invert: true },
  },
  { name: 'PT of 32-bit floats', image: 'ptFloat', tolerance: EXACT },
  {
    name: 'PT of 32-bit floats, nearest',
    image: 'ptFloat',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
  },
  { name: 'pixels that are not square', image: 'nonSquare', tolerance: EXACT },
  {
    name: 'an image smaller than the canvas',
    image: 'small',
    tolerance: EXACT,
  },
  { name: 'an image larger than the canvas', image: 'large', tolerance: EXACT },
];

/** The cases of the window, the VOI function, invert, colormap and opacity. */
const LOOK_CASES: StackCase[] = [
  {
    name: 'narrow window',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { voiRange: { lower: 30, upper: 50 } },
  },
  {
    name: 'wide window',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { voiRange: { lower: -1000, upper: 2000 } },
  },
  {
    name: 'narrow window on the CT of the example',
    image: EXAMPLE_CT,
    tolerance: EXACT,
    presentation: { voiRange: { lower: 30, upper: 50 } },
  },
  {
    name: 'inverted',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { invert: true },
  },
  { name: 'MONOCHROME1', image: 'ct16Monochrome1', tolerance: EXACT },
  {
    name: 'MONOCHROME1, invert set to false',
    image: 'ct16Monochrome1',
    tolerance: EXACT,
    presentation: { invert: false },
  },
  {
    name: 'MONOCHROME1, invert set to true',
    image: 'ct16Monochrome1',
    tolerance: EXACT,
    presentation: { invert: true },
  },
  {
    name: 'hsv colormap',
    image: 'ct16',
    tolerance: GPU_FILTERING,
    presentation: { colormap: { name: 'hsv' } },
  },
  {
    name: 'hsv colormap on a PT of 32-bit floats',
    image: 'ptFloat',
    tolerance: EXACT,
    presentation: { colormap: { name: 'hsv' } },
  },
  {
    name: 'sigmoid VOI function',
    image: EXAMPLE_CT,
    tolerance: EXACT,
    presentation: { voiLUTFunction: 'SIGMOID' },
  },
  {
    name: 'layer opacity 0.5',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { opacity: 0.5 },
  },
];

/** The cases of the interpolation at a zoom below 1, at 1 and above 1. */
const ZOOM_CASES: StackCase[] = [
  {
    name: 'nearest',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
  },
  {
    name: 'linear, zoom 0.5',
    image: 'ct16',
    tolerance: GPU_FILTERING,
    presentation: { interpolationType: LINEAR },
    view: { zoom: 0.5 },
  },
  {
    name: 'nearest, zoom 0.5',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
    view: { zoom: 0.5 },
  },
  {
    name: 'linear, zoom 4',
    image: 'ct16',
    tolerance: EXACT,
    view: { zoom: 4 },
  },
  {
    name: 'nearest, zoom 4',
    image: 'ct16',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
    view: { zoom: 4 },
  },
  {
    name: 'nearest 8-bit image, zoom 3',
    image: 'u8',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
    view: { zoom: 3 },
  },
  {
    name: 'linear RGB image, zoom 3',
    image: 'rgb',
    tolerance: EXACT,
    view: { zoom: 3 },
  },
  {
    name: 'nearest RGB image, zoom 3',
    image: 'rgb',
    tolerance: EXACT,
    presentation: { interpolationType: NEAREST },
    view: { zoom: 3 },
  },
  {
    name: 'CT of the example, zoom 3',
    image: EXAMPLE_CT,
    tolerance: EXACT,
    view: { zoom: 3 },
  },
  {
    name: 'smaller image, zoom 0.3',
    image: 'small',
    tolerance: EXACT,
    view: { zoom: 0.3 },
  },
  {
    name: 'larger image, zoom 4',
    image: 'large',
    tolerance: EXACT,
    view: { zoom: 4 },
  },
];

/** The cases of a changed view and of a second image on top. */
const VIEW_CASES: StackCase[] = [
  {
    name: 'pan',
    image: EXAMPLE_CT,
    tolerance: GPU_FILTERING,
    view: { pan: [40, -25] },
  },
  {
    name: 'rotate 30 degrees',
    image: EXAMPLE_CT,
    tolerance: GPU_FILTERING,
    view: { rotation: 30 },
  },
  {
    name: 'rotate 90 degrees',
    image: EXAMPLE_CT,
    tolerance: GPU_FILTERING,
    view: { rotation: 90 },
  },
  {
    name: 'flip horizontal',
    image: EXAMPLE_CT,
    tolerance: GPU_FILTERING,
    view: { flipHorizontal: true },
  },
  {
    name: 'flip vertical',
    image: EXAMPLE_CT,
    tolerance: GPU_FILTERING,
    view: { flipVertical: true },
  },
  {
    name: 'pixels that are not square, wide window, rotate 30 degrees',
    image: 'nonSquare',
    tolerance: GPU_FILTERING,
    presentation: { voiRange: { lower: -1000, upper: 2000 } },
    view: { rotation: 30 },
  },
  {
    name: 'a second image on top',
    image: 'ct16',
    tolerance: EXACT,
    overlay: {
      image: 'ct16b',
      presentation: { colormap: { name: 'hsv' }, opacity: 0.5 },
    },
  },
];

type TestViewport = {
  getImageIds: () => string[];
  getRenderPlan: () => Array<{ draw: string; renderMode: string }>;
  setDisplaySets: (...entries: unknown[]) => Promise<void>;
  setDisplaySetPresentation: (
    dataId: string,
    props: Record<string, unknown>
  ) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: [number, number]) => void;
  setViewState: (patch: Record<string, unknown>) => void;
  worldToCanvas: (point: number[]) => [number, number];
  render: () => void;
};

type ImagePlane = {
  rowCosines?: number[];
  columnCosines?: number[];
  imagePositionPatient?: number[];
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
};

/** An image that the page makes: its size, pixels, look and metadata. */
type ImageSpec = {
  id: string;
  size: [number, number];
  spacing: [number, number];
  ArrayType:
    | Int16ArrayConstructor
    | Uint8ArrayConstructor
    | Uint16ArrayConstructor
    | Float32ArrayConstructor;
  components?: number;
  modality: string;
  fill: (
    x: number,
    y: number,
    columns: number,
    rows: number
  ) => number | number[];
  window: [number, number];
  preScale?: Record<string, unknown>;
  photometricInterpretation?: string;
};

type TestWindow = typeof window & {
  cornerstone: {
    getRenderingEngine: (id: string) => {
      getViewport: (viewportId: string) => TestViewport;
      enableElement: (input: Record<string, unknown>) => void;
      disableElement: (viewportId: string) => void;
    };
    setRenderBackend: (backend: string) => void;
    cache: {
      getImage: (imageId: string) => {
        rows: number;
        columns: number;
        rowPixelSpacing: number;
        columnPixelSpacing: number;
      };
    };
    metaData: {
      get: (type: string, imageId: string) => ImagePlane;
      addProvider: (
        provider: (type: string, imageId: string) => unknown,
        priority: number
      ) => void;
    };
    imageLoader: {
      registerImageLoader: (
        scheme: string,
        loader: (imageId: string) => { promise: Promise<unknown> }
      ) => void;
    };
    utilities: {
      VoxelManager: {
        createImageVoxelManager: (options: Record<string, unknown>) => {
          getScalarData: () => ArrayLike<number>;
        };
      };
      genericViewportDisplaySetMetadataProvider: {
        add: (id: string, value: Record<string, unknown>) => void;
      };
    };
    Enums: { ViewportType: Record<string, string> };
  };
  stackParity?: {
    mount: (
      stackCase: StackCase,
      imageIds: Record<string, string>
    ) => Promise<number>;
    pin: (backend: string) => Promise<void>;
    readOutline: (width: number, height: number) => number[];
    unmount: () => void;
  };
};

/**
 * Opens the example, waits for its CT, and installs in the page the images of
 * the cases (made with the image loader and the metadata provider of
 * cornerstone) and the functions that mount a case on a viewport of its own.
 *
 * @returns the image id of the CT of the example
 */
async function openExample(page: Page): Promise<string> {
  await page.goto(createExampleUrl(EXAMPLE + '.html').toString());
  await page.waitForFunction(
    ({ engineId, viewportId }) =>
      ((window as TestWindow).cornerstone
        ?.getRenderingEngine(engineId)
        ?.getViewport(viewportId)
        ?.getImageIds?.()?.length ?? 0) > 0,
    { engineId: ENGINE_ID, viewportId: EXAMPLE_VIEWPORT_ID },
    { timeout: LOAD_TIMEOUT_MS }
  );
  await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });

  return page.evaluate(
    ({ engineId, viewportId, outlineDistance }) => {
      const testWindow = window as TestWindow;
      const cs = testWindow.cornerstone;
      const registry: Record<string, Record<string, unknown>> = {};
      const ctValue = (x: number, y: number, columns: number, rows: number) => {
        const u = (x / columns) * 512;
        const v = (y / rows) * 512;
        const radius = Math.hypot(u - 256, v - 256);

        if (v >= 60 && v < 90 && u >= 60 && u < 450) {
          return Math.round(-1000 + ((u - 60) * 3000) / 390);
        }

        if (radius > 230) {
          return -1000;
        }

        if (radius > 200 && radius < 215) {
          return 1200;
        }

        return Math.round(40 + 60 * Math.sin(u / 9) * Math.cos(v / 13));
      };
      const specs: ImageSpec[] = [
        {
          id: 'ct16',
          size: [512, 512],
          spacing: [0.7, 0.7],
          ArrayType: Int16Array,
          modality: 'CT',
          fill: ctValue,
          window: [40, 400],
        },
        {
          id: 'ct16Monochrome1',
          size: [512, 512],
          spacing: [0.7, 0.7],
          ArrayType: Int16Array,
          modality: 'CR',
          fill: ctValue,
          window: [40, 400],
          photometricInterpretation: 'MONOCHROME1',
        },
        {
          id: 'ct16b',
          size: [512, 512],
          spacing: [0.7, 0.7],
          ArrayType: Int16Array,
          modality: 'CT',
          fill: (x: number, y: number) =>
            Math.round(500 * Math.sin(x / 23) * Math.sin(y / 17)),
          window: [0, 1000],
        },
        {
          id: 'u8',
          size: [256, 256],
          spacing: [1, 1],
          ArrayType: Uint8Array,
          modality: 'MR',
          fill: (x: number, y: number) =>
            x >= 50 && x < 100 && y >= 50 && y < 100
              ? 230
              : Math.round(127 + 100 * Math.sin(x / 7) * Math.sin(y / 11)),
          window: [128, 256],
        },
        {
          id: 'rgb',
          size: [300, 200],
          spacing: [1, 1],
          ArrayType: Uint8Array,
          components: 3,
          modality: 'XC',
          fill: (x: number, y: number) => [
            Math.round((x * 255) / 299),
            Math.round((y * 255) / 199),
            ((x >> 4) + (y >> 4)) & 1 ? 230 : 20,
          ],
          window: [128, 256],
        },
        {
          id: 'ptFloat',
          size: [128, 128],
          spacing: [4, 4],
          ArrayType: Float32Array,
          modality: 'PT',
          fill: (x: number, y: number) =>
            x >= 90 && x < 96 && y >= 30 && y < 36
              ? 15
              : 0.5 + 8 * Math.exp(-((x - 64) ** 2 + (y - 60) ** 2) / 200),
          window: [2.5, 5],
          preScale: {
            scaled: true,
            scalingParameters: { modality: 'PT', suvbw: 1 },
          },
        },
        {
          id: 'nonSquare',
          size: [256, 256],
          spacing: [0.5, 1],
          ArrayType: Int16Array,
          modality: 'CT',
          fill: ctValue,
          window: [40, 400],
        },
        {
          id: 'small',
          size: [64, 64],
          spacing: [1, 1],
          ArrayType: Uint16Array,
          modality: 'MR',
          fill: (x: number, y: number) =>
            ((x >> 3) + (y >> 3)) & 1 ? 3000 + x * 10 : 500 + y * 20,
          window: [2000, 4000],
        },
        {
          id: 'large',
          size: [2048, 2048],
          spacing: [0.2, 0.2],
          ArrayType: Int16Array,
          modality: 'CT',
          fill: ctValue,
          window: [40, 400],
        },
      ];

      specs.forEach((spec) => {
        const [columns, rows] = spec.size;
        const [columnSpacing, rowSpacing] = spec.spacing;
        const components = spec.components ?? 1;
        const imageId = `stackParity:${spec.id}`;
        const pixelData = new spec.ArrayType(rows * columns * components);
        let min = Infinity;
        let max = -Infinity;

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < columns; x++) {
            const values = spec.fill(x, y, columns, rows);

            for (let c = 0; c < components; c++) {
              const value = Array.isArray(values) ? values[c] : values;

              pixelData[(y * columns + x) * components + c] = value;
              min = Math.min(min, value);
              max = Math.max(max, value);
            }
          }
        }

        const voxelManager = cs.utilities.VoxelManager.createImageVoxelManager({
          width: columns,
          height: rows,
          numberOfComponents: components,
          scalarData: pixelData,
          id: imageId,
        });
        const color = components > 1;
        const photometricInterpretation = color
          ? 'RGB'
          : (spec.photometricInterpretation ?? 'MONOCHROME2');
        const bits = spec.ArrayType.BYTES_PER_ELEMENT * 8;

        registry[imageId] = {
          image: {
            imageId,
            rows,
            columns,
            width: columns,
            height: rows,
            intercept: 0,
            slope: 1,
            voxelManager,
            invert: photometricInterpretation === 'MONOCHROME1',
            windowCenter: spec.window[0],
            windowWidth: spec.window[1],
            minPixelValue: min,
            maxPixelValue: max,
            rowPixelSpacing: rowSpacing,
            columnPixelSpacing: columnSpacing,
            getPixelData: () => voxelManager.getScalarData(),
            sizeInBytes: pixelData.byteLength,
            color,
            rgba: false,
            numberOfComponents: components,
            dataType: pixelData.constructor.name,
            photometricInterpretation,
            preScale: spec.preScale,
          },
          imagePixelModule: {
            photometricInterpretation,
            rows,
            columns,
            samplesPerPixel: components,
            bitsAllocated: bits,
            bitsStored: bits,
            highBit: bits - 1,
            pixelRepresentation: spec.ArrayType === Int16Array ? 1 : 0,
          },
          generalSeriesModule: { modality: spec.modality },
          imagePlaneModule: {
            rows,
            columns,
            imageOrientationPatient: [1, 0, 0, 0, 1, 0],
            rowCosines: [1, 0, 0],
            columnCosines: [0, 1, 0],
            imagePositionPatient: [-10, -20, 30],
            pixelSpacing: [rowSpacing, columnSpacing],
            rowPixelSpacing: rowSpacing,
            columnPixelSpacing: columnSpacing,
            frameOfReferenceUID: 'stackParity',
            sliceThickness: 2,
          },
          voiLutModule: {
            windowCenter: [spec.window[0]],
            windowWidth: [spec.window[1]],
          },
          modalityLutModule: { rescaleSlope: 1, rescaleIntercept: 0 },
        };
      });

      cs.imageLoader.registerImageLoader('stackParity', (imageId: string) => ({
        promise: Promise.resolve(registry[imageId].image),
      }));
      cs.metaData.addProvider((type: string, imageId: string) => {
        if (
          typeof imageId !== 'string' ||
          !imageId.startsWith('stackParity:')
        ) {
          return;
        }

        return registry[imageId]?.[type];
      }, 100000);

      const engine = cs.getRenderingEngine(engineId);
      let mounted:
        | {
            viewport: TestViewport;
            element: HTMLElement;
            imageId: string;
            id: string;
          }
        | undefined;
      let count = 0;
      const waitFor = async (check: () => boolean, timeout: number) => {
        const start = Date.now();

        while (!check()) {
          if (Date.now() - start > timeout) {
            throw new Error('stackParity: timed out');
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };

      testWindow.stackParity = {
        async mount(stackCase, imageIds) {
          const imageIdOf = (name: string) =>
            imageIds[name] ?? `stackParity:${name}`;
          const id = `STACK_PARITY_${++count}`;
          const element = document.createElement('div');

          element.style.width = '480px';
          element.style.height = '360px';
          document.body.appendChild(element);
          cs.setRenderBackend('gpu');
          engine.enableElement({
            viewportId: id,
            type: cs.Enums.ViewportType.PLANAR,
            element,
            defaultOptions: { background: stackCase.background },
          });

          const viewport = engine.getViewport(id);
          const sourceId = `${id}:source`;
          const overlayId = `${id}:overlay`;
          const entries: unknown[] = [{ displaySetId: sourceId, options: {} }];

          cs.utilities.genericViewportDisplaySetMetadataProvider.add(sourceId, {
            imageIds: [imageIdOf(stackCase.image)],
            kind: 'planar',
            initialImageIdIndex: 0,
          });

          if (stackCase.overlay) {
            cs.utilities.genericViewportDisplaySetMetadataProvider.add(
              overlayId,
              {
                imageIds: [imageIdOf(stackCase.overlay.image)],
                kind: 'planar',
                initialImageIdIndex: 0,
              }
            );
            entries.push({
              displaySetId: overlayId,
              options: { role: 'overlay' },
            });
          }

          await viewport.setDisplaySets(...entries);

          if (stackCase.presentation) {
            viewport.setDisplaySetPresentation(
              sourceId,
              stackCase.presentation
            );
          }

          if (stackCase.overlay?.presentation) {
            viewport.setDisplaySetPresentation(
              overlayId,
              stackCase.overlay.presentation
            );
          }

          const { zoom, pan, ...patch } = stackCase.view ?? {};

          if (zoom) {
            viewport.setZoom(zoom);
          }

          if (pan) {
            viewport.setPan(pan);
          }

          if (Object.keys(patch).length) {
            viewport.setViewState(patch);
          }

          viewport.render();
          mounted = {
            viewport,
            element,
            imageId: imageIdOf(stackCase.image),
            id,
          };

          return Array.from(
            document.querySelectorAll('[data-viewport-uid]')
          ).indexOf(element);
        },
        async pin(backend) {
          cs.setRenderBackend(backend);
          await waitFor(
            () =>
              mounted.viewport
                .getRenderPlan()
                .every((layer: { draw: string }) => layer.draw === backend),
            30000
          );
          mounted.viewport.render();
        },
        readOutline(width, height) {
          const { viewport, imageId } = mounted;
          const image = cs.cache.getImage(imageId);
          const plane = cs.metaData.get('imagePlaneModule', imageId);
          const rowCosines = plane.rowCosines ?? [1, 0, 0];
          const columnCosines = plane.columnCosines ?? [0, 1, 0];
          const origin = plane.imagePositionPatient ?? [0, 0, 0];
          const columnSpacing =
            plane.columnPixelSpacing ?? image.columnPixelSpacing;
          const rowSpacing = plane.rowPixelSpacing ?? image.rowPixelSpacing;
          const scale = window.devicePixelRatio || 1;
          const corner = (i: number, j: number) => {
            const [x, y] = viewport.worldToCanvas(
              [0, 1, 2].map(
                (axis) =>
                  origin[axis] +
                  rowCosines[axis] * i * columnSpacing +
                  columnCosines[axis] * j * rowSpacing
              )
            );

            return [x * scale, y * scale];
          };
          const corners = [
            corner(-0.5, -0.5),
            corner(image.columns - 0.5, -0.5),
            corner(image.columns - 0.5, image.rows - 0.5),
            corner(-0.5, image.rows - 0.5),
          ];
          const mask = new Array(width * height).fill(0);

          corners.forEach(([x1, y1], index) => {
            const [x2, y2] = corners[(index + 1) % corners.length];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lengthSquared = dx * dx + dy * dy || 1;
            const reach = Math.ceil(outlineDistance) + 1;

            for (
              let y = Math.max(0, Math.floor(Math.min(y1, y2)) - reach);
              y <= Math.min(height - 1, Math.ceil(Math.max(y1, y2)) + reach);
              y++
            ) {
              for (
                let x = Math.max(0, Math.floor(Math.min(x1, x2)) - reach);
                x <= Math.min(width - 1, Math.ceil(Math.max(x1, x2)) + reach);
                x++
              ) {
                const t = Math.max(
                  0,
                  Math.min(
                    1,
                    ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / lengthSquared
                  )
                );
                const ex = x1 + t * dx - x - 0.5;
                const ey = y1 + t * dy - y - 0.5;

                if (ex * ex + ey * ey <= outlineDistance * outlineDistance) {
                  mask[y * width + x] = 1;
                }
              }
            }
          });

          return mask;
        },
        unmount() {
          engine.disableElement(mounted.id);
          mounted.element.remove();
          mounted = undefined;
          cs.setRenderBackend('gpu');
        },
      };

      return engine.getViewport(viewportId).getImageIds()[0];
    },
    {
      engineId: ENGINE_ID,
      viewportId: EXAMPLE_VIEWPORT_ID,
      outlineDistance: OUTLINE_DISTANCE,
    }
  );
}

/**
 * Draws the image of a case with the GPU draw step (`vtkImage`) and with the
 * CPU draw step (`cpuImage`) and checks that the CPU picture follows the GPU
 * picture within the tolerance of the case, away from the outline of the
 * image.
 */
async function expectSamePicture(
  page: Page,
  stackCase: StackCase,
  exampleImageId: string
): Promise<void> {
  const viewportIndex = await page.evaluate(
    ({ stackCase, imageIds }) =>
      (window as TestWindow).stackParity.mount(stackCase, imageIds),
    {
      stackCase: { background: BACKGROUND, ...stackCase },
      imageIds: { [EXAMPLE_CT]: exampleImageId },
    }
  );
  const pin = async (backend: 'gpu' | 'cpu') => {
    await page.evaluate(
      (backend) => (window as TestWindow).stackParity.pin(backend),
      backend
    );
    await waitForRenderSettled(page, { quietMs: 300, timeout: 30000 });
  };

  await pin('gpu');

  const gpu = await readViewportPixels(page, viewportIndex, { stableMs: 500 });

  await pin('cpu');

  const cpu = await readViewportPixels(page, viewportIndex, { stableMs: 500 });
  const outline = Uint8Array.from(
    await page.evaluate(
      ({ width, height }) =>
        (window as TestWindow).stackParity.readOutline(width, height),
      { width: gpu.width, height: gpu.height }
    )
  );

  await page.evaluate(() => (window as TestWindow).stackParity.unmount());

  const total = gpu.width * gpu.height;
  const overOne = countPixelsDifferingBy(gpu, cpu, 1, outline);
  const overEight = countPixelsDifferingBy(gpu, cpu, 8, outline);

  console.log(
    `${stackCase.name}: away from the outline of the image, ${overOne} of ${total} pixels differ by more than 1 level, ${overEight} by more than 8`
  );
  expect(cpu.width, `${stackCase.name}: canvas width`).toBe(gpu.width);
  expect(cpu.height, `${stackCase.name}: canvas height`).toBe(gpu.height);
  expect(
    countContentPixels(cpu),
    `${stackCase.name}: pixels that are not background`
  ).toBeGreaterThanOrEqual(total * MIN_CONTENT_FRACTION);
  expect(
    overOne,
    `${stackCase.name}: pixels that differ by more than 1 level`
  ).toBeLessThanOrEqual(total * stackCase.tolerance.overOne);
  expect(
    overEight,
    `${stackCase.name}: pixels that differ by more than 8 levels`
  ).toBeLessThanOrEqual(total * stackCase.tolerance.overEight);
}

/** Draws a case with the GPU draw step and gives its pixels. */
async function readGpuPicture(
  page: Page,
  stackCase: StackCase,
  exampleImageId: string
) {
  const viewportIndex = await page.evaluate(
    ({ stackCase, imageIds }) =>
      (window as TestWindow).stackParity.mount(stackCase, imageIds),
    {
      stackCase: { background: BACKGROUND, ...stackCase },
      imageIds: { [EXAMPLE_CT]: exampleImageId },
    }
  );
  await page.evaluate(() => (window as TestWindow).stackParity.pin('gpu'));
  await waitForRenderSettled(page, { quietMs: 300, timeout: 30000 });

  const pixels = await readViewportPixels(page, viewportIndex, {
    stableMs: 500,
  });

  await page.evaluate(() => (window as TestWindow).stackParity.unmount());

  return pixels;
}

/** Runs the cases of a group, one after the other, in one opened example. */
function describeCases(title: string, cases: StackCase[]): void {
  test(title, async ({ page }) => {
    const exampleImageId = await openExample(page);

    for (const stackCase of cases) {
      await expectSamePicture(page, stackCase, exampleImageId);
    }
  });
}

test.describe('Stack draw parity: cpuImage draws the picture of vtkImage', () => {
  test.describe.configure({ mode: 'parallel' });
  test.setTimeout(300000);

  describeCases('kinds of image', IMAGE_CASES);
  describeCases('window, VOI function, invert, colormap, opacity', LOOK_CASES);
  describeCases('interpolation and zoom', ZOOM_CASES);
  describeCases('a changed view and a second image', VIEW_CASES);

  test('a MONOCHROME1 image starts inverted', async ({ page }) => {
    const exampleImageId = await openExample(page);
    const monochrome1 = await readGpuPicture(
      page,
      { name: 'MONOCHROME1', image: 'ct16Monochrome1', tolerance: EXACT },
      exampleImageId
    );
    const inverted = await readGpuPicture(
      page,
      {
        name: 'inverted',
        image: 'ct16',
        tolerance: EXACT,
        presentation: { invert: true },
      },
      exampleImageId
    );
    const total = inverted.width * inverted.height;

    expect(countContentPixels(monochrome1)).toBeGreaterThanOrEqual(
      total * MIN_CONTENT_FRACTION
    );
    expect(
      countPixelsDifferingBy(inverted, monochrome1, 1),
      'pixels of the MONOCHROME1 image that differ from the inverted MONOCHROME2 image'
    ).toBe(0);
  });
});
