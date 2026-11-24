import { SampleOldClass } from './local';
import { Enums } from 'another-package';
import { utilities } from '@cornerstonejs/tools';

const service = { EVENTS: { SAMPLE_OLD_EVENT: 'x' } };
const other = { getSampleOld() {}, sampleOldId: 1 };

export function run(item: { setDisplaySets(input: unknown): void }) {
  item.setDisplaySets({ sampleOldId: 'a' });
  other.getSampleOld();
  utilities.sampleOldProvider.add('id', { sampleKind: 'planar' });

  return [
    service.EVENTS.SAMPLE_OLD_EVENT,
    Enums.Events.SAMPLE_OLD_EVENT,
    other.sampleOldId,
    new SampleOldClass(),
  ];
}
