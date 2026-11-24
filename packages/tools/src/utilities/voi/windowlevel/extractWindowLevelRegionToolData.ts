import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { cache, utilities as csUtils } from '@cornerstonejs/core';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'utilities.voi.windowlevel.extractWindowLevelRegionToolData'
);

function extractWindowLevelRegionToolData(viewport: Types.IViewport) {
  const contentMode = csUtils.getViewportContentMode(viewport);

  if (contentMode === 'volume') {
    return extractImageDataOfVolumeSlice(viewport as PlanarViewport);
  }

  return extractImageDataOfCurrentImage(viewport);
}

/**
 * The slice of a next viewport that shows a volume, read as on a legacy
 * volume viewport. An oblique slice has no such slice, so the region window
 * level is skipped with a warning instead of a throw that would end the tool
 * interaction.
 */
function extractImageDataOfVolumeSlice(viewport: PlanarViewport) {
  try {
    return extractImageDataVolume(viewport);
  } catch (error) {
    cs3dLogger.warn(
      'WindowLevelRegionTool: the current slice is oblique; skipping region window level.',
      error
    );
    return undefined;
  }
}

function extractImageDataVolume(viewport: PlanarViewport) {
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

function extractImageDataOfCurrentImage(viewport: Types.IViewport) {
  const imageId = (viewport as PlanarViewport).getCurrentImageId();

  if (!imageId) {
    // A volume-mode native viewport on a reformatted (sagittal / coronal /
    // oblique) plane resolves to no single backing cornerstone image, so there
    // is no per-image slice to read here. Degrade gracefully (the caller skips
    // the region window level) instead of throwing, which would abort the tool
    // interaction. Full reformatted-slice region window-leveling for native
    // volume viewports needs slice-view plumbing on the viewport and is
    // tracked as a follow-up.
    cs3dLogger.warn(
      'WindowLevelRegionTool: the current native viewport slice has no backing image (reformatted/oblique volume plane); skipping region window level.'
    );
    return undefined;
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
