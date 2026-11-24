import {
  Enums,
  SampleNewClass as SampleOldClass,
  eventTarget,
  sampleRegistry,
} from '@cornerstonejs/core';
import { SampleOldClass as FromPath } from '@cornerstonejs/core/types';

export {
  SampleNewClass as Exported,
  sampleRemovedFunction,
} from '@cornerstonejs/core';

const SampleNewClass = 'a local name';
const { SAMPLE_NEW_EVENT: renamedLocal = 'fallback', ...rest } = Enums.Events;

export function compare(type: string, compute: () => string) {
  eventTarget.addEventListener('CORNERSTONE_SAMPLE_OLD_EVENT', compute);
  sampleRegistry.add('two', { sampleKind: compute() });

  return [
    type === Enums.Events.SAMPLE_NEW_EVENT ||
      type === Enums.Events.SAMPLE_NEW_EVENT,
    new SampleOldClass(),
    FromPath,
    SampleNewClass,
    renamedLocal,
    rest,
  ];
}
