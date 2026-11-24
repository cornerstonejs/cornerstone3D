import { Enums, type Types } from '@cornerstonejs/core';
import { createSynchronizer } from '../../store/SynchronizerManager';
import viewFramingSyncCallback from '../callbacks/viewFramingSyncCallback';
import type Synchronizer from '../../store/SynchronizerManager/Synchronizer';
import type { ISynchronizerEventHandler } from '../../types';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `cameraSyncCallback` based on framing view
 * values and not based on absolute camera positions.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createViewFramingSynchronizer(
  synchronizerName: string,
  options?: Types.ViewFramingSelector
): Synchronizer {
  const viewFraming = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    viewFramingSyncCallback as ISynchronizerEventHandler,
    { viewFraming: options }
  );

  return viewFraming;
}
