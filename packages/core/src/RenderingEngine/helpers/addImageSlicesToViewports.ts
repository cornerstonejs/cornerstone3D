import type {
  IStackViewport,
  IStackInput,
  IRenderingEngine,
} from '../../types';

/**
 * For each provided viewport it adds a volume to the viewport using the
 * provided renderingEngine
 *
 *
 * @param renderingEngine - The rendering engine to use to get viewports from
 * @param volumeInputs - Array of volume inputs including volumeId. Other properties
 * such as visibility, callback, blendMode, slabThickness are optional
 * @param viewportIds - Array of viewport IDs to add the volume to
 * @param immediateRender - If true, the volumes will be rendered immediately
 * @returns A promise that resolves when all volumes have been added
 */
function addImageSlicesToViewports(
  renderingEngine: IRenderingEngine,
  stackInputs: IStackInput[],
  viewportIds: string[]
): Promise<void> {
  // Check if all viewports are volumeViewports
  for (const viewportId of viewportIds) {
    const viewport = renderingEngine.getStackViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    // if not instance of BaseVolumeViewport, throw
    if (!viewport.addImages) {
      console.warn(
        `Viewport with Id ${viewportId} does not have addImages. Cannot add image segmentation to this viewport.`
      );

      return;
    }
  }

  viewportIds.forEach((viewportId) => {
    const viewport = renderingEngine.getStackViewport(viewportId);
    viewport.addImages(stackInputs);
  });
}

export default addImageSlicesToViewports;
