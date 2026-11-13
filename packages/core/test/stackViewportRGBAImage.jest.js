import StackViewport from '../src/RenderingEngine/StackViewport';
import * as metaData from '../src/metaData';
import { VoxelManager } from '../src/utilities';
import { getImageDataMetadata } from '../src/utilities/getImageDataMetadata';
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

// An RGBA color image, as cached by loadImageToCanvas({ useCPURendering: true }),
// displayed for the first time in a GPU StackViewport (#3055). 5x7 = 35 pixels,
// so the RGBA length is not a multiple of 3.
const rows = 5;
const columns = 7;
const numPixels = rows * columns;
const imageId = 'test:stack-rgba';

const imagePlaneModule = {
  rows,
  columns,
  rowPixelSpacing: 1,
  columnPixelSpacing: 1,
  rowCosines: [1, 0, 0],
  columnCosines: [0, 1, 0],
  imagePositionPatient: [0, 0, 0],
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
};
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
  imagePlaneModule,
};
const provider = (type, id) => (id === imageId ? modules[type] : undefined);

function createRGBAImage(rgb) {
  const rgba = new Uint8ClampedArray(numPixels * 4);
  for (let i = 0; i < numPixels; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return {
    imageId,
    rows,
    columns,
    width: columns,
    height: rows,
    color: true,
    rgba: true,
    numberOfComponents: 3,
    sizeInBytes: rgba.byteLength,
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    getPixelData: () => rgba,
    voxelManager: VoxelManager.createImageVoxelManager({
      width: columns,
      height: rows,
      scalarData: rgba,
      numberOfComponents: 3,
    }),
  };
}

// A GPU StackViewport cannot be constructed in jest (no WebGL), so run the
// real _updateActorToDisplayImageId / vtkImageData creation code against a
// viewport object whose camera and actor plumbing is stubbed.
function createStubViewport() {
  const viewport = Object.create(StackViewport.prototype);
  Object.assign(viewport, {
    id: 'stack-rgba',
    _imageData: undefined,
    stackInvalidated: false,
    _publishCalibratedEvent: false,
    getImageDataMetadata: (image) => getImageDataMetadata(image),
    _getImagePlaneModule: () => imagePlaneModule,
    getViewPresentation: jest.fn(),
    setViewPresentation: jest.fn(),
    getActor: jest.fn(),
    getActors: () => [],
    setActors: jest.fn(),
    createActorMapper: jest.fn(() => ({})),
    _getCameraOrientation: () => ({
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    }),
    getCamera: jest.fn(() => ({})),
    setCameraNoEvent: jest.fn(),
    resetCameraNoEvent: jest.fn(),
    triggerCameraEvent: jest.fn(),
    _setPropertiesFromCache: jest.fn(),
  });
  return viewport;
}

describe('StackViewport with an RGBA cached color image', () => {
  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  it('creates a 3-component vtkImageData on first display', () => {
    const rgb = new Uint8ClampedArray(numPixels * 3).map((_, i) => i % 256);
    const image = createRGBAImage(rgb);
    const viewport = createStubViewport();

    viewport._updateActorToDisplayImageId(image);

    const scalars = viewport._imageData.getPointData().getScalars();
    expect(scalars.getNumberOfComponents()).toBe(3);
    expect(scalars.getData()).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(scalars.getData())).toEqual(Array.from(rgb));
    expect(Array.from(image.voxelManager.getScalarData())).toEqual(
      Array.from(rgb)
    );
  });
});
