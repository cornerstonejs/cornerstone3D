import { StackViewport } from '..';
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
async function addImageSlicesToViewports(
  renderingEngine: IRenderingEngine,
  stackInputs: Array<IStackInput>,
  viewportIds: Array<string>,
  immediateRender = false,
  suppressEvents = false
): Promise<void> {
  // Check if all viewports are volumeViewports
  for (const viewportId of viewportIds) {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    // if not instance of BaseVolumeViewport, throw
    if (!(viewport as IStackViewport).addImages) {
      console.warn(
        `Viewport with Id ${viewportId} does not have addImages. Cannot add image segmentation to this viewport.`
      );

      return;
    }
  }

  const addStackPromises = viewportIds.map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId) as IStackViewport;

    return viewport.addImages(stackInputs, immediateRender, suppressEvents);
  });

  await Promise.all(addStackPromises);
}

export default addImageSlicesToViewports;
