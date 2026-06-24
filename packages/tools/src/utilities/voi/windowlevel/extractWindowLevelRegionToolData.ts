import type { Types } from '@cornerstonejs/core';
import {
  cache,
  utilities as csUtils,
  StackViewport,
  VolumeViewport,
} from '@cornerstonejs/core';

function extractWindowLevelRegionToolData(viewport: Types.IViewport) {
  if (viewport instanceof VolumeViewport) {
    return extractImageDataVolume(viewport);
  }
  if (viewport instanceof StackViewport) {
    return extractImageDataStack(viewport);
  }
  // Native ("next") generic viewports are neither a StackViewport nor a
  // VolumeViewport. In stack / vtkImage mode (and axially aligned MPR) the
  // displayed slice resolves to a cornerstone image, so read its pixel data
  // from the cache and return the same shape the stack extractor returns.
  if (csUtils.isGenericViewport(viewport)) {
    return extractImageDataGeneric(viewport);
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

function extractImageDataGeneric(viewport: Types.IGenericViewport) {
  const imageId = viewport.getCurrentImageId();

  if (!imageId) {
    throw new Error('Viewport not supported');
  }

  const image = cache.getImage(imageId);

  if (!image) {
    throw new Error('Viewport not supported');
  }

  const scalarData = image.getPixelData();
  const { rows, columns, color } = image;
  const { min: minPixelValue, max: maxPixelValue } =
    csUtils.getMinMax(scalarData);

  return {
    scalarData,
    width: columns,
    height: rows,
    minPixelValue,
    maxPixelValue,
    rows,
    columns,
    color,
  };
}

export { extractWindowLevelRegionToolData };
