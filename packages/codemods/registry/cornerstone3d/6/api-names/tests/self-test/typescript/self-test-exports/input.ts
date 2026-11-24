import * as cs from '@cornerstonejs/core';
import {
  Enums,
  EVENTS,
  SampleOldClass,
  Types,
  eventTarget,
  sampleRemovedFunction,
  utilities,
} from '@cornerstonejs/core';
import type { SampleOldClass as OldAlias } from '@cornerstonejs/core';
import { sampleOldTool } from '@cornerstonejs/tools';

const { Events } = Enums;
const { SAMPLE_OLD_EVENT } = Enums.Events;

export function make(onEvent: () => void) {
  const instance = new SampleOldClass();
  const holder = { SampleOldClass };
  const typed: OldAlias = instance;
  const other: cs.SampleOldClass = new cs.SampleOldClass();
  const sample: Types.SampleOldType = undefined;
  const nested: cs.Types.SampleOldType = undefined;

  eventTarget.addEventListener(Enums.Events.SAMPLE_OLD_EVENT, onEvent);
  eventTarget.addEventListener(Events.SAMPLE_OLD_EVENT, onEvent);
  eventTarget.addEventListener(EVENTS.SAMPLE_OLD_EVENT, onEvent);
  eventTarget.addEventListener(cs.Enums.Events['SAMPLE_OLD_EVENT'], onEvent);
  eventTarget.addEventListener(SAMPLE_OLD_EVENT, onEvent);

  utilities.sampleOldProvider.add('one', { sampleKind: 'planar', imageIds: [] });
  sampleRemovedFunction();
  sampleOldTool(instance);

  return [holder, typed, other, sample, nested];
}

export { SampleOldClass };
