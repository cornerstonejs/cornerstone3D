import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { InterpolationType } from '../src/enums';
import * as metaData from '../src/metaData';
import VoxelManager from '../src/utilities/VoxelManager';
import { applyPlanarImagePresentation } from '../src/RenderingEngine/helpers/planarImageRendering';
import { PlanarSampledSliceActor } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceActor';
import {
  PlanarSampledSliceCanvas,
  colourChannels,
  colourSlice,
  colourWholeNumbers,
  getColourTables,
} from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceCanvas';
import { PlanarSliceSampler } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSlice';
import {
  CpuImageSliceRenderPath,
  createImageSliceVolume,
} from '../src/RenderingEngine/GenericViewport/Planar/CpuImageSliceRenderPath';

/**
 * The colour tables that the CPU draw step reads for a presentation, applied
 * as the image path (`image`) or the volume path (`volume`) applies it.
 */
function tablesFor(presentation, kind = 'image', previous) {
  const actor = new PlanarSampledSliceActor();

  if (kind === 'image') {
    applyPlanarImagePresentation({ actor: actor.actor, props: presentation });
  } else {
    actor.applyPresentation(presentation, undefined);
  }

  return getColourTables(actor, previous);
}

/** The pixels that `colourSlice` gives for some values. */
function colouredBySlice(values, tables) {
  const pixels = new Uint32Array(values.length);

  colourSlice(values, pixels, tables);

  return pixels;
}

/** Whole values from `lowest` to `highest` and back, `count` of them. */
function wholeValues(ArrayType, lowest, highest, count) {
  const values = new ArrayType(count);
  const span = highest - lowest;

  for (let index = 0; index < count; index++) {
    values[index] = lowest + ((index * 37) % (span + 1));
  }

  values[0] = lowest;
  values[count - 1] = highest;

  return values;
}

const PRESENTATIONS = {
  'narrow window': { voiRange: { lower: 30, upper: 50 } },
  'wide window': { voiRange: { lower: -1000, upper: 2000 } },
  inverted: { voiRange: { lower: -100, upper: 300 }, invert: true },
  colormap: { voiRange: { lower: 0, upper: 1000 }, colormap: { name: 'hsv' } },
};

describe('colourWholeNumbers', () => {
  const arrays = [
    ['Int16 with negative values', Int16Array, -1024, 3000],
    ['Uint16', Uint16Array, 0, 4095],
    ['Uint8', Uint8Array, 0, 255],
  ];

  arrays.forEach(([arrayName, ArrayType, lowest, highest]) => {
    Object.entries(PRESENTATIONS).forEach(([lookName, presentation]) => {
      it(`gives the pixels of colourSlice: ${arrayName}, ${lookName}`, () => {
        const tables = tablesFor(presentation);
        const pixelData = wholeValues(ArrayType, lowest, highest, 6000);
        const pixels = new Uint32Array(pixelData.length);

        expect(
          colourWholeNumbers(
            { pixelData, min: lowest, max: highest },
            pixels,
            tables
          )
        ).toBe(true);
        expect(pixels).toEqual(colouredBySlice(pixelData, tables));
      });
    });
  });

  it('colours nothing for float data, for more than 65536 values and for fewer pixels than values', () => {
    const tables = tablesFor(PRESENTATIONS['wide window']);
    const cases = [
      { pixelData: new Float32Array([0, 1, 2, 3]), min: 0, max: 3 },
      {
        pixelData: wholeValues(Int32Array, -40000, 40000, 100000),
        min: -40000,
        max: 40000,
      },
      { pixelData: new Int16Array([0, 500, 1000]), min: 0, max: 1000 },
    ];

    cases.forEach((slice) => {
      const pixels = new Uint32Array(slice.pixelData.length);

      expect(colourWholeNumbers(slice, pixels, tables)).toBe(false);
      expect(pixels.every((pixel) => pixel === 0)).toBe(true);
    });
  });

  it('stops at a value outside the lowest and the highest value it was given', () => {
    const tables = tablesFor(PRESENTATIONS['wide window']);
    const pixelData = wholeValues(Int16Array, 0, 100, 1000);

    pixelData[500] = 400;
    pixelData[700] = -5;

    expect(
      colourWholeNumbers(
        { pixelData, min: 0, max: 100 },
        new Uint32Array(pixelData.length),
        tables
      )
    ).toBe(false);
  });

  it('lets the draw step colour such a slice with colourSlice', () => {
    const putImageData = jest.spyOn(
      CanvasRenderingContext2D.prototype,
      'putImageData'
    );
    const width = 64;
    const pixelData = wholeValues(Int16Array, 0, 10, width);

    pixelData[5] = 400;

    const volume = createImageSliceVolume(createImage('lying-range'));
    const canvas = new PlanarSampledSliceCanvas(volume, 4, 4, 'image');
    const target = document.createElement('canvas');
    const presentation = PRESENTATIONS['wide window'];

    target.width = 4;
    target.height = 4;
    canvas.setSlice({
      pixelData,
      numberOfComponents: 1,
      width,
      height: 1,
      origin: [0, 0, 0],
      xDirection: [1, 0, 0],
      yDirection: [0, 1, 0],
      zDirection: [0, 0, 1],
      spacing: [1, 1],
      min: 0,
      max: 10,
      insideVolume: true,
      sampledFor: {
        interpolationType: InterpolationType.LINEAR,
        sliceIndex: 0,
      },
    });
    canvas.draw({
      target: {
        canvas: target,
        context: target.getContext('2d'),
        composition: { clearedRenderPassId: -1, renderPassId: 1 },
      },
      camera: {
        focalPoint: [32, 0.5, 0],
        parallelScale: 32,
        viewPlaneNormal: [0, 0, -1],
        viewUp: [0, -1, 0],
      },
      presentation,
      invalidated: true,
    });

    const drawn = new Uint32Array(
      putImageData.mock.calls.at(-1)[0].data.buffer.slice(0)
    );

    putImageData.mockRestore();
    expect(drawn).toEqual(colouredBySlice(pixelData, tablesFor(presentation)));
  });
});

describe('colourChannels', () => {
  const presentation = { voiRange: { lower: 50, upper: 200 }, opacity: 0.5 };
  const rgb = [
    [0, 60, 255],
    [120, 199, 51],
    [201, 49, 125],
  ];

  /** The colour that the GPU gives a pixel: each channel reads the red of the table. */
  const expected = (tables) => {
    const alpha = Math.round(255 * 0.5) << 24;

    return Uint32Array.from(
      rgb.map(
        (pixel) =>
          alpha |
          pixel.reduce(
            (packed, value, channel) =>
              packed |
              ((colouredBySlice(new Uint8Array([value]), tables)[0] & 0xff) <<
                (channel * 8)),
            0
          )
      )
    );
  };

  it('colours each channel of an RGB slice through the colour table', () => {
    const tables = tablesFor(presentation);
    const pixels = new Uint32Array(rgb.length);

    colourChannels(Uint8Array.from(rgb.flat()), pixels, tables, 3);

    expect(pixels).toEqual(expected(tables));
  });

  it('leaves the fourth channel of an RGBA slice out', () => {
    const tables = tablesFor(presentation);
    const pixels = new Uint32Array(rgb.length);

    colourChannels(
      Uint8Array.from(rgb.flatMap((pixel) => [...pixel, 17])),
      pixels,
      tables,
      4
    );

    expect(pixels).toEqual(expected(tables));
  });
});

describe('colour tables kept across a window change', () => {
  /**
   * Tables for a second window made fresh and made from the tables of a
   * first window, and values to colour with both.
   */
  const compare = (kind, first, second) => {
    const values = new Float32Array(
      Array.from({ length: 4000 }, (_, i) => -1200 + i * 0.97)
    );
    const previous = tablesFor(first, kind);
    const fresh = tablesFor(second, kind);
    const kept = tablesFor(second, kind, previous);

    return { previous, fresh, kept, values };
  };

  const changes = [
    [
      'image',
      'linear VOI',
      { voiRange: { lower: -100, upper: 300 } },
      { voiRange: { lower: 20, upper: 60 } },
    ],
    [
      'image',
      'sigmoid VOI',
      { voiRange: { lower: -100, upper: 300 }, voiLUTFunction: 'SIGMOID' },
      { voiRange: { lower: 0, upper: 500 }, voiLUTFunction: 'SIGMOID' },
    ],
    [
      'image',
      'colormap',
      { voiRange: { lower: 0, upper: 1000 }, colormap: { name: 'hsv' } },
      { voiRange: { lower: -200, upper: 50 }, colormap: { name: 'hsv' } },
    ],
    [
      'volume',
      'linear VOI',
      { voiRange: { lower: -100, upper: 300 } },
      { voiRange: { lower: 20, upper: 60 } },
    ],
    [
      'volume',
      'colormap with an opacity array',
      {
        voiRange: { lower: 0, upper: 1000 },
        colormap: {
          name: 'hsv',
          opacity: [
            { value: 0, opacity: 0 },
            { value: 0.5, opacity: 0.6 },
            { value: 1, opacity: 0.8 },
          ],
        },
      },
      {
        voiRange: { lower: -200, upper: 50 },
        colormap: {
          name: 'hsv',
          opacity: [
            { value: 0, opacity: 0 },
            { value: 0.5, opacity: 0.6 },
            { value: 1, opacity: 0.8 },
          ],
        },
      },
    ],
  ];

  changes.forEach(([kind, name, first, second]) => {
    it(`keeps the steps and gives the pixels of new tables: ${kind}, ${name}`, () => {
      const { previous, fresh, kept, values } = compare(kind, first, second);

      expect(kept.colours).toBe(previous.colours);
      expect(kept.alphas).toBe(previous.alphas);
      expect(colouredBySlice(values, kept)).toEqual(
        colouredBySlice(values, fresh)
      );
    });
  });

  it('reuses the colour and alpha steps of a linear window change', () => {
    const previous = tablesFor({ voiRange: { lower: -100, upper: 300 } });
    const next = tablesFor(
      { voiRange: { lower: 20, upper: 60 } },
      'image',
      previous
    );

    expect(next.colours).toBe(previous.colours);
    expect(next.alphas).toBe(previous.alphas);
    expect(next.colourScale).not.toBe(previous.colourScale);
  });

  it('makes the steps again for another colormap or another opacity', () => {
    const previous = tablesFor({ voiRange: { lower: 0, upper: 100 } });
    const colormap = tablesFor(
      { voiRange: { lower: 0, upper: 100 }, colormap: { name: 'hsv' } },
      'image',
      previous
    );
    const opacity = tablesFor(
      { voiRange: { lower: 0, upper: 100 }, opacity: 0.5 },
      'image',
      previous
    );

    expect(colormap.colours).not.toBe(previous.colours);
    expect(opacity.colours).toBe(previous.colours);
    expect(opacity.alphas).not.toBe(previous.alphas);
  });
});

/** The metadata of the test images: a rotated plane and pixels that are not square. */
const ROW_COSINES = [0, 1, 0];
const COLUMN_COSINES = [0, 0, -1];
const IMAGE_POSITION = [10, -20, 30];
const COLUMN_SPACING = 0.5;
const ROW_SPACING = 2;
const COLUMNS = 6;
const ROWS = 4;

const metadataProvider = (type, imageId) => {
  if (typeof imageId !== 'string' || !imageId.startsWith('cpuImageDraw:')) {
    return;
  }

  if (type === 'imagePlaneModule') {
    return {
      rows: ROWS,
      columns: COLUMNS,
      rowCosines: ROW_COSINES,
      columnCosines: COLUMN_COSINES,
      imageOrientationPatient: [...ROW_COSINES, ...COLUMN_COSINES],
      imagePositionPatient: IMAGE_POSITION,
      pixelSpacing: [ROW_SPACING, COLUMN_SPACING],
      rowPixelSpacing: ROW_SPACING,
      columnPixelSpacing: COLUMN_SPACING,
      frameOfReferenceUID: 'cpuImageDraw',
    };
  }

  if (type === 'imagePixelModule') {
    return {
      photometricInterpretation: 'MONOCHROME2',
      rows: ROWS,
      columns: COLUMNS,
      samplesPerPixel: 1,
      bitsAllocated: 16,
      bitsStored: 16,
      highBit: 15,
      pixelRepresentation: 1,
    };
  }

  if (type === 'generalSeriesModule') {
    return { modality: 'CT' };
  }
};

/** A 6 x 4 image of Int16 values, each pixel its own value. */
function createImage(name) {
  const imageId = `cpuImageDraw:${name}`;
  const scalarData = new Int16Array(COLUMNS * ROWS);

  scalarData.forEach((_, index) => {
    scalarData[index] = index * 7 - 50;
  });

  const voxelManager = VoxelManager.createImageVoxelManager({
    width: COLUMNS,
    height: ROWS,
    scalarData,
    id: imageId,
  });

  return {
    imageId,
    rows: ROWS,
    columns: COLUMNS,
    width: COLUMNS,
    height: ROWS,
    slope: 1,
    intercept: 0,
    windowCenter: 40,
    windowWidth: 400,
    minPixelValue: -50,
    maxPixelValue: scalarData.at(-1),
    rowPixelSpacing: ROW_SPACING,
    columnPixelSpacing: COLUMN_SPACING,
    color: false,
    numberOfComponents: 1,
    voxelManager,
    getPixelData: () => voxelManager.getScalarData(),
    sizeInBytes: scalarData.byteLength,
  };
}

beforeAll(() => {
  metaData.addProvider(metadataProvider, 100000);
});

afterAll(() => {
  metaData.removeProvider(metadataProvider);
});

describe('the image as a volume of one slice', () => {
  it('has the position, direction and spacing of the image', () => {
    const volume = createImageSliceVolume(createImage('geometry'));
    const normal = [
      ROW_COSINES[1] * COLUMN_COSINES[2] - ROW_COSINES[2] * COLUMN_COSINES[1],
      ROW_COSINES[2] * COLUMN_COSINES[0] - ROW_COSINES[0] * COLUMN_COSINES[2],
      ROW_COSINES[0] * COLUMN_COSINES[1] - ROW_COSINES[1] * COLUMN_COSINES[0],
    ];

    expect(volume.dimensions).toEqual([COLUMNS, ROWS, 1]);
    expect(Array.from(volume.origin)).toEqual(IMAGE_POSITION);
    expect(Array.from(volume.direction)).toEqual([
      ...ROW_COSINES,
      ...COLUMN_COSINES,
      ...normal,
    ]);
    expect(volume.spacing).toEqual([COLUMN_SPACING, ROW_SPACING, 1]);
    expect(volume.imageData.indexToWorld([2, 3, 0])).toEqual([
      IMAGE_POSITION[0],
      IMAGE_POSITION[1] + 2 * COLUMN_SPACING,
      IMAGE_POSITION[2] - 3 * ROW_SPACING,
    ]);
  });

  [InterpolationType.LINEAR, InterpolationType.NEAREST].forEach(
    (interpolationType) => {
      it(`gives the values of the image unchanged for its own plane (${interpolationType === InterpolationType.LINEAR ? 'linear' : 'nearest'})`, () => {
        const image = createImage('values');
        const volume = createImageSliceVolume(image);
        const sampler = new PlanarSliceSampler({
          enlargesColours: true,
          keepFractions: true,
        });
        const centre = [0, 1, 2].map(
          (axis) =>
            IMAGE_POSITION[axis] +
            ROW_COSINES[axis] * COLUMN_SPACING * (COLUMNS - 1) * 0.5 +
            COLUMN_COSINES[axis] * ROW_SPACING * (ROWS - 1) * 0.5
        );
        const slice = sampler.sample(
          volume,
          {
            focalPoint: centre,
            viewPlaneNormal: volume.direction.slice(6, 9).map((v) => -v),
            viewUp: COLUMN_COSINES.map((v) => -v),
          },
          { interpolationType }
        );

        expect(slice.width).toBe(COLUMNS);
        expect(slice.height).toBe(ROWS);
        expect(slice.insideVolume).toBe(true);
        expect(Array.from(slice.pixelData)).toEqual(
          Array.from(image.getPixelData())
        );
      });
    }
  );
});

describe('CpuImageSliceRenderPath on the canvas', () => {
  /** Mounts an image on the CPU image path of a canvas with a background. */
  async function mountImage(presentation) {
    const canvas = document.createElement('canvas');

    canvas.width = 12;
    canvas.height = 8;

    const context = canvas.getContext('2d');
    const fills = [];
    const fillRect = context.fillRect.bind(context);

    context.fillRect = (...args) => {
      fills.push(context.fillStyle);
      fillRect(...args);
    };

    const image = createImage('canvas');
    const volume = createImageSliceVolume(image);
    const centre = [0, 1, 2].map(
      (axis) =>
        IMAGE_POSITION[axis] +
        ROW_COSINES[axis] * COLUMN_SPACING * (COLUMNS - 1) * 0.5 +
        COLUMN_COSINES[axis] * ROW_SPACING * (ROWS - 1) * 0.5
    );
    const ctx = {
      viewportId: 'viewport',
      renderingEngineId: 'engine',
      viewport: {
        element: document.createElement('div'),
        getViewState: jest.fn(() => undefined),
        isCurrentDataId: jest.fn(() => true),
        invalidateResolvedView: jest.fn(),
        getOverlayActors: jest.fn(() => []),
      },
      view: {
        activeSourceICamera: {
          focalPoint: centre,
          parallelScale: 4,
          viewPlaneNormal: volume.direction.slice(6, 9).map((v) => -v),
          viewUp: COLUMN_COSINES.map((v) => -v),
        },
      },
      display: {
        activateRenderMode: jest.fn(),
        markRendered: jest.fn(),
        renderNow: jest.fn(),
        setNeedsRender: jest.fn(),
        requestRender: jest.fn(),
      },
      cpu: {
        canvas,
        context,
        composition: { clearedRenderPassId: -1, renderPassId: 1 },
        getBackground: () => [0.2, 0.1, 0.3],
      },
    };
    const attachment = await new CpuImageSliceRenderPath().addData(
      ctx,
      {
        id: 'image-data',
        type: 'image',
        image,
        imageIds: [image.imageId],
        initialImageIdIndex: 0,
      },
      { role: 'source' }
    );

    attachment.updateDataPresentation(presentation);

    return { attachment, context, fills };
  }

  it('clears to the background of the viewport and draws the image over it', async () => {
    const draw = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
    const { attachment, context, fills } = await mountImage({});

    context.fillStyle = 'rgb(51, 26, 77)';

    const background = context.fillStyle;

    attachment.render();

    expect(fills).toEqual([background]);
    expect(draw).toHaveBeenCalledTimes(1);
    draw.mockRestore();
    attachment.removeData();
  });

  it('shows only the background for a layer that is not visible', async () => {
    const draw = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
    const { attachment, context, fills } = await mountImage({
      visible: false,
    });

    context.fillStyle = 'rgb(51, 26, 77)';

    const background = context.fillStyle;

    attachment.render();

    expect(fills).toEqual([background]);
    expect(draw).not.toHaveBeenCalled();
    draw.mockRestore();
    attachment.removeData();
  });
});
