import * as cs from '@cornerstonejs/core';
import {
  Enums,
  EVENTS,
  SampleNewClass,
  Types,
  eventTarget,
  sampleRemovedFunction,
} from '@cornerstonejs/core';
import type { SampleNewClass as OldAlias } from '@cornerstonejs/core';
import { sampleNewTool } from '@cornerstonejs/tools';

const { Events } = Enums;
const { SAMPLE_NEW_EVENT } = Enums.Events;

export function make(onEvent: () => void) {
  const instance = new SampleNewClass();
  const holder = { SampleOldClass: SampleNewClass };
  const typed: OldAlias = instance;
  const other: cs.SampleNewClass = new cs.SampleNewClass();
  const sample: Types.SampleNewType = undefined;
  const nested: cs.Types.SampleNewType = undefined;

  eventTarget.addEventListener(Enums.Events.SAMPLE_NEW_EVENT, onEvent);
  eventTarget.addEventListener(Events.SAMPLE_NEW_EVENT, onEvent);
  eventTarget.addEventListener(EVENTS.SAMPLE_NEW_EVENT, onEvent);
  eventTarget.addEventListener(cs.Enums.Events['SAMPLE_NEW_EVENT'], onEvent);
  eventTarget.addEventListener(SAMPLE_NEW_EVENT, onEvent);

  cs.sampleRegistry.add('one', { imageIds: [] });
  sampleRemovedFunction();
  sampleNewTool(instance);

  return [holder, typed, other, sample, nested];
}

export { SampleNewClass as SampleOldClass };
