import { Enums, SampleOldClass, eventTarget, utilities } from '@cornerstonejs/core';
import { SampleOldClass as FromPath } from '@cornerstonejs/core/types';

export {
  SampleOldClass as Exported,
  sampleRemovedFunction,
} from '@cornerstonejs/core';

const SampleNewClass = 'a local name';
const { SAMPLE_OLD_EVENT: renamedLocal = 'fallback', ...rest } = Enums.Events;

export function compare(type: string, compute: () => string) {
  eventTarget.addEventListener('CORNERSTONE_SAMPLE_OLD_EVENT', compute);
  utilities.sampleOldProvider.add('two', { sampleKind: compute() });

  return [
    type === Enums.Events.SAMPLE_OLD_EVENT ||
      type === Enums.Events.SAMPLE_OTHER_EVENT,
    new SampleOldClass(),
    FromPath,
    SampleNewClass,
    renamedLocal,
    rest,
  ];
}
