import type { Types } from '@cornerstonejs/core';
import type { Synchronizer } from '../store';
import type { SynchronizerOptions } from '../store/SynchronizerManager/Synchronizer';

export default interface ISynchronizerEventHandler {
  (
    synchronizer: Synchronizer,
    sourceViewport: Types.IViewportId,
    targetViewport: Types.IViewportId,
    sourceEvent: Event,
    options?: SynchronizerOptions
  ): Promise<void> | void;
}
