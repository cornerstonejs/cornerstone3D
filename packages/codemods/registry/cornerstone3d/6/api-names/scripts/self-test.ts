import { familiesCodemod } from './rules.ts';
import type { Family } from './rules.ts';

/**
 * A family of made-up names with each kind of table entry. The fixtures of
 * `tests/self-test` run it, so the table engine stays tested while the
 * families of the step are empty or change. No name of it is a name of
 * Cornerstone, and the workflow does not run it.
 */
const sample: Family = {
  rules: {
    exports: [
      { name: 'SampleOldClass', to: 'SampleNewClass' },
      { namespace: 'Types', name: 'SampleOldType', to: 'SampleNewType' },
      {
        namespace: 'Enums.Events',
        name: 'SAMPLE_OLD_EVENT',
        to: 'SAMPLE_NEW_EVENT',
        review: 'the detail has a cause',
        value: 'CORNERSTONE_SAMPLE_OLD_EVENT',
      },
      {
        namespace: 'Enums.Events',
        name: 'SAMPLE_OTHER_EVENT',
        to: 'SAMPLE_NEW_EVENT',
      },
      {
        namespace: 'utilities',
        name: 'sampleOldProvider',
        moveTo: 'sampleRegistry',
      },
      { name: 'sampleRemovedFunction', manual: 'call sampleOther' },
      {
        package: '@cornerstonejs/tools',
        name: 'sampleOldTool',
        to: 'sampleNewTool',
      },
    ],
    members: [
      { receiver: 'viewport', name: 'getSampleOld', to: 'getSampleNew' },
      {
        receiver: 'viewport',
        name: 'sampleRemovedMember',
        manual: 'read sampleOther',
      },
      { receiver: 'engine', name: 'sampleEngineOld', to: 'sampleEngineNew' },
      {
        receiver: { returnOf: 'getViewReference' },
        name: 'sampleOldId',
        to: 'sampleNewId',
      },
      {
        receiver: { type: 'ViewReference' },
        name: 'sampleOldId',
        to: 'sampleNewId',
      },
    ],
    keys: [
      {
        in: { receiver: 'viewport', method: 'setDisplaySets', argument: 0 },
        key: 'sampleOldId',
        to: 'sampleNewId',
      },
      {
        in: { receiver: 'viewport', method: 'setDisplaySets', argument: 0 },
        key: 'sampleRemovedKey',
        manual: 'give it to the registry',
      },
      {
        in: { call: 'utilities.sampleOldProvider.add', argument: 1 },
        key: 'sampleKind',
        remove: true,
      },
      {
        in: { type: 'PublicViewportInput' },
        key: 'defaultOptions.sampleOldOption',
        to: 'sampleNewOption',
      },
    ],
  },
};

export default familiesCodemod([sample]);
