import { eventTarget, utilities } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import { addSegmentations } from './addSegmentations';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { getSegmentation } from './getSegmentation';
import { getSegmentations } from './getSegmentations';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    utilities: {
      ...actual.utilities,
      logger: {
        ...actual.utilities.logger,
        toolsLog: {
          getLogger: jest.fn(() => ({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            setLevel: jest.fn(),
          })),
        },
      },
    },
  };
});

function getModuleLogger(name: string) {
  const getLogger = utilities.logger.toolsLog.getLogger as jest.Mock;
  const index = getLogger.mock.calls.findIndex(([arg]) => arg === name);
  return getLogger.mock.results[index]?.value;
}

function contourInput(segmentationId: string, label: string) {
  return {
    segmentationId,
    representation: {
      type: SegmentationRepresentations.Contour,
      data: {},
    },
    config: { label },
  };
}

describe('addSegmentations', () => {
  let addedIds: string[];
  let modifiedIds: string[];

  const onAdded = (evt) => addedIds.push(evt.detail.segmentationId);
  const onModified = (evt) => modifiedIds.push(evt.detail.segmentationId);

  beforeEach(() => {
    defaultSegmentationStateManager.resetState();
    addedIds = [];
    modifiedIds = [];
    eventTarget.addEventListener(Events.SEGMENTATION_ADDED, onAdded);
    eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, onModified);
  });

  afterEach(() => {
    eventTarget.removeEventListener(Events.SEGMENTATION_ADDED, onAdded);
    eventTarget.removeEventListener(Events.SEGMENTATION_MODIFIED, onModified);
    defaultSegmentationStateManager.resetState();
  });

  it('skips an input whose segmentationId already exists', () => {
    addSegmentations([contourInput('seg-1', 'Original')]);
    addedIds = [];
    modifiedIds = [];

    expect(() =>
      addSegmentations([
        contourInput('seg-1', 'Duplicate'),
        contourInput('seg-2', 'Second'),
      ])
    ).not.toThrow();

    expect(getSegmentations().map((s) => s.segmentationId)).toEqual([
      'seg-1',
      'seg-2',
    ]);
    expect(getSegmentation('seg-1').label).toBe('Original');
    expect(getSegmentation('seg-2').label).toBe('Second');
    expect(addedIds).toEqual(['seg-2']);
    expect(modifiedIds).toEqual(['seg-2']);

    const log = getModuleLogger(
      'stateManagement.segmentation.addSegmentations'
    );
    expect(log?.warn).toHaveBeenCalledTimes(1);
    expect(log?.warn).toHaveBeenCalledWith(expect.stringContaining('seg-1'));
  });
});
