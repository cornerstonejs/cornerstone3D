import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import presentationViewSyncCallback from '../callbacks/presentationViewSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { CAMERA_MODIFIED } = Enums.Events;

export type PresentationViewSynchronizerOptions = {
  /**
   * Applies the display area value.
   */
  applyDisplayArea?: boolean;
  /**
   * Applies the slice thickness
   */
  applySlabThickness?: boolean;
  /**
   * Applies rotation.  This will affect the viewUp for the viewport based on
   * the default viewUp for that orientation, and can thus be applied across
   * viewports.
   */
  applyRotation?: boolean;
};

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `cameraSyncCallback` based on presentation view
 * values and not based on absolute camera positions.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createPresentationViewSynchronizer(
  synchronizerName: string,
  options?: PresentationViewSynchronizerOptions
): Synchronizer {
  const presentationView = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    presentationViewSyncCallback,
    options
  );

  return presentationView;
}
