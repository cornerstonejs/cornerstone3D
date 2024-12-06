import type { Types } from '@cornerstonejs/core';
import {
  utilities as csUtils,
  StackViewport,
  VolumeViewport,
} from '@cornerstonejs/core';

function extractWindowLevelRegionToolData(
  viewport: VolumeViewport | StackViewport
) {
  if (viewport instanceof VolumeViewport) {
    return extractImageDataVolume(viewport);
  }
  if (viewport instanceof StackViewport) {
    return extractImageDataStack(viewport);
  }

  throw new Error('Viewport not supported');
}

function extractImageDataVolume(viewport: Types.IVolumeViewport) {
  const { scalarData, width, height } =
    csUtils.getCurrentVolumeViewportSlice(viewport);
  const { min: minPixelValue, max: maxPixelValue } =
    csUtils.getMinMax(scalarData);
  return {
    scalarData,
    minPixelValue,
    maxPixelValue,
    width,
    height,
    rows: width,
    columns: height,
    // color,
  };
}

function extractImageDataStack(viewport: Types.IStackViewport) {
  const imageData = viewport.getImageData();
  const { scalarData } = imageData;
  const { min: minPixelValue, max: maxPixelValue } =
    csUtils.getMinMax(scalarData);
  const width = imageData.dimensions[0];
  const height = imageData.dimensions[1];
  const { rows, columns, color } = viewport.getCornerstoneImage();

  return {
    scalarData,
    width,
    height,
    minPixelValue,
    maxPixelValue,
    rows,
    columns,
    color,
  };
}

export { extractWindowLevelRegionToolData };
