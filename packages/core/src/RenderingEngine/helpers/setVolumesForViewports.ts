import BaseVolumeViewport from '../BaseVolumeViewport';
import type {
  IVolumeInput,
  IRenderingEngine,
  IVolumeViewport,
} from '../../types';

/**
 * Similar to {@link addVolumesToViewports} it adds volumes to viewports; however,
 * this method will Set the volumes on the viewports which means that the previous
 * volumes will be removed.
 *
 * @param renderingEngine - The rendering engine to use to get viewports from
 * @param volumeInputs - Array of volume inputs including volumeId. Other properties
 * such as visibility, callback, blendMode, slabThickness are optional
 * @param viewportIds - Array of viewport IDs to add the volume to
 * @param immediateRender - If true, the volumes will be rendered immediately
 * @returns A promise that resolves when all volumes have been added
 */
async function setVolumesForViewports(
  renderingEngine: IRenderingEngine,
  volumeInputs: Array<IVolumeInput>,
  viewportIds: Array<string>,
  immediateRender = false,
  suppressEvents = false
): Promise<void> {
  // Check if all viewports are volumeViewports
  viewportIds.forEach((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    // if not instance of BaseVolumeViewport, throw
    if (!(viewport instanceof BaseVolumeViewport)) {
      throw new Error('setVolumesForViewports only supports VolumeViewport and VolumeViewport3D');
    }
  });

  const setVolumePromises = viewportIds.map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId) as IVolumeViewport;

    await viewport.setVolumes(volumeInputs, immediateRender, suppressEvents);
  });

  await Promise.all(setVolumePromises);

  return;
}

export default setVolumesForViewports;
