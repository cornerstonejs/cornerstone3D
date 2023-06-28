import { utilities, Enums } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const { calibratedPixelSpacingMetadataProvider } = utilities;

/**
 * It adds the provided spacing to the Cornerstone internal calibratedPixelSpacing
 * metadata provider, then it invalidates all the tools that have the imageId as
 * their reference imageIds. Finally, it triggers a re-render for invalidated annotations.
 * @param imageId - ImageId for the calibrated image
 * @param rowPixelSpacing - Spacing in row direction
 * @param columnPixelSpacing - Spacing in column direction
 * @param renderingEngine - Cornerstone RenderingEngine instance
 */
export default function calibrateImageSpacing(
  imageId: string,
  renderingEngine: Types.IRenderingEngine,
  spacing: Types.IImageCalibration | number
): void {
  // Handle simple parameter version
  if (typeof spacing === 'number') {
    spacing = {
      type: Enums.CalibrationTypes.USER,
      scale: spacing,
    };
  }
  // 1. Add the calibratedPixelSpacing metadata to the metadata
  calibratedPixelSpacingMetadataProvider.add(imageId, spacing);

  // 2. Update the actor for stackViewports
  const viewports = renderingEngine.getStackViewports();

  // 2.1 If imageId is already being used in a stackViewport -> update actor
  viewports.forEach((viewport) => {
    const imageIds = viewport.getImageIds();
    if (imageIds.includes(imageId)) {
      viewport.calibrateSpacing(imageId);
    }
  });

  // 2.2 If imageId is cached but not being displayed in a viewport, stackViewport
  // will handle using the calibratedPixelSpacing since it has been added
  // to the provider
}
