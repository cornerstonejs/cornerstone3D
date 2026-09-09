import type { ModuleTagEntry } from './index';

/** VOI LUT module tags. */
export const tags: ModuleTagEntry[] = [
  'WindowCenter',
  'WindowWidth',
  'VOILUTFunction',
  'WindowCenterWidthExplanation',
  // Naturalized as `voiLUTSequence`; when present it defines the VOI
  // transformation instead of the window (C.11.2.1)
  'VOILUTSequence',
];
