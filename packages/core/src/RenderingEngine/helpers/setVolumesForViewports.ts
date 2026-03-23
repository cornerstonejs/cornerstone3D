import type { IVolumeInput, IRenderingEngine } from '../../types';
import isVolumeCompatible from './supportsVolumeCompatibilityApi';

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
  volumeInputs: IVolumeInput[],
  viewportIds: string[],
  immediateRender = false,
  suppressEvents = false
): Promise<void> {
  const compatibleViewports = viewportIds.map((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    if (!isVolumeCompatible(viewport)) {
      throw new Error(
        'setVolumesForViewports only supports viewports that implement setVolumes'
      );
    }

    return viewport;
  });

  await Promise.all(
    compatibleViewports.map((viewport) =>
      viewport.setVolumes(volumeInputs, immediateRender, suppressEvents)
    )
  );

  return;
}

export default setVolumesForViewports;
