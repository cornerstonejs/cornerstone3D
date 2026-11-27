import type { IVolumeInput, IRenderingEngine } from '../../types';
import { coreLog } from '../../utilities/logger';
import isVolumeCompatible, {
  type ICompatibleVolumeViewport,
} from './supportsVolumeCompatibilityApi';

const log = coreLog.getLogger('RenderingEngine', 'addVolumesToViewports');

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
async function addVolumesToViewports(
  renderingEngine: IRenderingEngine,
  volumeInputs: IVolumeInput[],
  viewportIds: string[],
  immediateRender = false,
  suppressEvents = false
): Promise<void> {
  const compatibleViewports: ICompatibleVolumeViewport[] = [];

  for (const viewportId of viewportIds) {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    if (!isVolumeCompatible(viewport)) {
      log.warn(
        `Viewport with Id ${viewportId} does not implement addVolumes. Cannot add volume to this viewport.`
      );

      return;
    }

    compatibleViewports.push(viewport);
  }

  await Promise.all(
    compatibleViewports.map((viewport) =>
      viewport.addVolumes(volumeInputs, immediateRender, suppressEvents)
    )
  );
  return;
}

export default addVolumesToViewports;
