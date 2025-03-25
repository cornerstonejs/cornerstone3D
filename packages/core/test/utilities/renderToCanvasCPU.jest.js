import {
  getRuntimeId,
  isEqual,
  planar,
  isOpposite,
  renderToCanvasCPU,
  VoxelManager,
} from '../../src/utilities';
import { VOILUTFunctionType } from '../../src/enums';
import { describe, it, expect } from '@jest/globals';
import { createCanvas } from 'canvas';
import getOrCreateCanvas, {
  setCanvasCreator,
  createCanvas as cs3dCreateCanvas,
} from '../../src/RenderingEngine/helpers/getOrCreateCanvas';

const rows = 64;
const columns = 64;
const numberOfComponents = 1;

const bytePixelData = new Uint8Array(rows * columns * numberOfComponents);

const image = {
  imageId: 'test:123',
  isPreScaled: false,
  minPixelValue: 0,
  maxPixelValue: 255,
  slope: 1,
  intercept: 0,
  windowCenter: 128,
  windowWidth: 255,
  voiLUTFunction: VOILUTFunctionType.LINEAR,
  getPixelData: () => bytePixelData,
  getCanvas: null,
  rows,
  columns,
  numberOfComponents,
  height: rows,
  width: columns,
  sizeInBytes: bytePixelData.byteLength,
  rowPixelSpacing: 1,
  columnPixelSpacing: 1,
  invert: false,
  color: numberOfComponents > 1,
  rgba: false,
  dataType: null,
  voxelManager: VoxelManager.createImageVoxelManager({
    width: columns,
    height: rows,
    scalarData: bytePixelData,
    numberOfComponents,
  }),
};

describe('Cornerstone-render Utilities:', function () {
  beforeEach(() => {
    setCanvasCreator(createCanvas);
  });

  it('Should render a grayscale image to canvas in node environment', async () => {
    const canvas = cs3dCreateCanvas(null, rows, columns);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        bytePixelData[i * columns + j] = j % 256;
      }
    }
    await renderToCanvasCPU(canvas, image);
    const context = canvas.getContext('2d');
    for (let i = 0; i < rows; i++) {
      const imageData = context.getImageData(0, i, columns, 1);
      const { data } = imageData;
      for (let j = 0; j < columns; j++) {
        expect(data[j * 4]).toBe(j % 256);
        expect(data[j * 4 + 3]).toBe(255);
      }
    }
    console.log('canvas', canvas.toDataURL('image/png'));
  });
});
