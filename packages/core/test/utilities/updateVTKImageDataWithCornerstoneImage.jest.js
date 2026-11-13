import { VoxelManager } from '../../src/utilities';
import { updateVTKImageDataWithCornerstoneImage } from '../../src/utilities/updateVTKImageDataWithCornerstoneImage';
import { normalizeRGBAImageToRGB } from '../../src/utilities/normalizeRGBAImageToRGB';
import { createVTKImageDataFromImage } from '../../src/RenderingEngine/helpers/planarImageRendering';
import * as metaData from '../../src/metaData';
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

// 5x7 = 35 pixels, so 4 * 35 is not a multiple of 3, as in the issue (#3055)
const rows = 5;
const columns = 7;
const numPixels = rows * columns;

function createMockImageData(numberOfComponents = 3) {
  const scalarData = new Uint8ClampedArray(numPixels * numberOfComponents);
  return {
    scalarData,
    getPointData: () => ({
      getScalars: () => ({
        getData: () => scalarData,
      }),
    }),
    modified: jest.fn(),
  };
}

function createColorImage(pixelData, { rgba, numberOfComponents = 3 }) {
  return {
    imageId: 'test:rgba',
    rows,
    columns,
    width: columns,
    height: rows,
    color: true,
    rgba,
    numberOfComponents,
    sizeInBytes: pixelData.byteLength,
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    getPixelData: () => pixelData,
    voxelManager: VoxelManager.createImageVoxelManager({
      width: columns,
      height: rows,
      scalarData: pixelData,
      numberOfComponents,
    }),
  };
}

function createRGB() {
  const rgb = new Uint8ClampedArray(numPixels * 3);
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = (i * 7) % 256;
  }
  return rgb;
}

function toRGBA(rgb) {
  const rgba = new Uint8ClampedArray(numPixels * 4);
  for (let i = 0; i < numPixels; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function expectRGBImage(image, rgb) {
  expect(image.rgba).toBe(false);
  expect(image.numberOfComponents).toBe(3);
  expect(image.getPixelData()).toBeInstanceOf(Uint8ClampedArray);
  expect(Array.from(image.getPixelData())).toEqual(Array.from(rgb));
  expect(image.voxelManager.getScalarData()).toBeInstanceOf(Uint8ClampedArray);
  expect(Array.from(image.voxelManager.getScalarData())).toEqual(
    Array.from(rgb)
  );
  expect(image.voxelManager.numberOfComponents).toBe(3);
  expect(image.voxelManager.getAtIndex(1)).toEqual([rgb[3], rgb[4], rgb[5]]);
}

describe('normalizeRGBAImageToRGB', () => {
  it('strips the alpha channel, keeps the array type and is idempotent', () => {
    const rgb = createRGB();
    const image = createColorImage(toRGBA(rgb), { rgba: true });

    normalizeRGBAImageToRGB(image);
    expectRGBImage(image, rgb);

    const { voxelManager } = image;
    normalizeRGBAImageToRGB(image);
    expect(image.voxelManager).toBe(voxelManager);
    expectRGBImage(image, rgb);
  });

  it('leaves RGB data alone even when rgba is flagged', () => {
    const rgb = createRGB();
    const image = createColorImage(rgb, { rgba: true });
    const { voxelManager } = image;

    normalizeRGBAImageToRGB(image);

    expect(image.voxelManager).toBe(voxelManager);
    expect(image.voxelManager.getScalarData()).toBe(rgb);
  });
});

describe('updateVTKImageDataWithCornerstoneImage', () => {
  it('copies RGB data as is when rgba is flagged but the data has 3 components', () => {
    const rgb = createRGB();
    const image = createColorImage(rgb, { rgba: true });
    const imageData = createMockImageData();

    updateVTKImageDataWithCornerstoneImage(imageData, image);

    expect(Array.from(imageData.scalarData)).toEqual(Array.from(rgb));
    expect(imageData.modified).toHaveBeenCalled();
  });

  it('strips the alpha channel from RGBA data and keeps the image accessors consistent', () => {
    const rgb = createRGB();
    const image = createColorImage(toRGBA(rgb), { rgba: true });
    const imageData = createMockImageData();

    updateVTKImageDataWithCornerstoneImage(imageData, image);

    expect(Array.from(imageData.scalarData)).toEqual(Array.from(rgb));
    expectRGBImage(image, rgb);
  });

  it('strips RGBA data even when the rgba flag is not set', () => {
    const rgb = createRGB();
    const image = createColorImage(toRGBA(rgb), { rgba: false });
    const imageData = createMockImageData();

    updateVTKImageDataWithCornerstoneImage(imageData, image);

    expect(Array.from(imageData.scalarData)).toEqual(Array.from(rgb));
    expectRGBImage(image, rgb);
  });

  it('copies RGBA data as is into a 4-component destination', () => {
    const rgba = toRGBA(createRGB());
    const image = createColorImage(rgba, {
      rgba: true,
      numberOfComponents: 4,
    });
    const imageData = createMockImageData(4);

    updateVTKImageDataWithCornerstoneImage(imageData, image);

    expect(Array.from(imageData.scalarData)).toEqual(Array.from(rgba));
  });
});

describe('createVTKImageDataFromImage', () => {
  const modules = {
    imagePixelModule: {
      photometricInterpretation: 'YBR_RCT',
      samplesPerPixel: 3,
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      pixelRepresentation: 0,
    },
    generalSeriesModule: { modality: 'US' },
    imagePlaneModule: {
      rows,
      columns,
      rowPixelSpacing: 1,
      columnPixelSpacing: 1,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    },
  };
  const provider = (type, imageId) =>
    imageId === 'test:rgba' ? modules[type] : undefined;

  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  it('creates a 3-component vtkImageData from an RGBA color image', () => {
    const rgb = createRGB();
    const image = createColorImage(toRGBA(rgb), { rgba: true });

    const imageData = createVTKImageDataFromImage(image);

    const scalars = imageData.getPointData().getScalars();
    expect(scalars.getNumberOfComponents()).toBe(3);
    expect(scalars.getData()).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(scalars.getData())).toEqual(Array.from(rgb));
    expectRGBImage(image, rgb);
  });
});
