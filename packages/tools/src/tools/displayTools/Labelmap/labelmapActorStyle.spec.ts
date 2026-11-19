jest.mock('@cornerstonejs/core', () => ({
  ActorRenderMode: {
    VTK_IMAGE: 'VTK_IMAGE',
    VTK_VOLUME_SLICE: 'VTK_VOLUME_SLICE',
  },
  Enums: {
    BlendModes: {
      MAXIMUM_INTENSITY_BLEND: 1,
      LABELMAP_EDGE_PROJECTION_BLEND: 6,
    },
  },
}));

jest.mock('@kitware/vtk.js/Common/DataModel/PiecewiseFunction', () => ({
  __esModule: true,
  default: { newInstance: () => mockCreateTransferFunction() },
}));

jest.mock('@kitware/vtk.js/Rendering/Core/ColorTransferFunction', () => ({
  __esModule: true,
  default: { newInstance: () => mockCreateTransferFunction() },
}));

jest.mock('../../../stateManagement/segmentation/activeSegmentation', () => ({
  getActiveSegmentation: jest.fn(),
}));

jest.mock(
  '../../../stateManagement/segmentation/getActiveSegmentIndex',
  () => ({ getActiveSegmentIndex: jest.fn(() => 1) })
);

jest.mock('../../../stateManagement/segmentation/getColorLUT', () => ({
  getColorLUT: jest.fn(),
}));

jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

jest.mock(
  '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices',
  () => ({ internalGetHiddenSegmentIndices: jest.fn() })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({ getSegmentBinding: jest.fn() })
);

jest.mock('../../../stateManagement/segmentation/SegmentationStyle', () => ({
  segmentationStyle: {
    getStyle: jest.fn(),
    getRenderInactiveSegmentations: jest.fn(() => true),
  },
}));

jest.mock('./volumeLabelmapImageMapper', () => ({
  getLabelmapForActorReference: jest.fn(),
}));

import type { Types } from '@cornerstonejs/core';
import { getActiveSegmentation } from '../../../stateManagement/segmentation/activeSegmentation';
import { getColorLUT } from '../../../stateManagement/segmentation/getColorLUT';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { internalGetHiddenSegmentIndices } from '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';
import { segmentationStyle } from '../../../stateManagement/segmentation/SegmentationStyle';
import type { LabelmapStyle } from '../../../types/LabelmapTypes';
import type { LabelmapRepresentation } from '../../../types/SegmentationStateTypes';
import { setLabelmapColorAndOpacity } from './labelmapActorStyle';
import getDefaultLabelmapStyle from './labelmapConfig';

type OpacityNode = { x: number; y: number };

const MAXIMUM_INTENSITY_BLEND = 1;
const LABELMAP_EDGE_PROJECTION_BLEND = 6;

const viewportId = 'viewport';
const segmentationId = 'segmentation';
const representation = {
  segmentationId,
  colorLUTIndex: 0,
} as LabelmapRepresentation;

// Segment 2's color is half transparent.
const colorLUT = [
  [0, 0, 0, 0],
  [255, 0, 0, 255],
  [0, 255, 0, 127.5],
  [0, 0, 255, 255],
];

function mockCreateTransferFunction() {
  return {
    addPoint: jest.fn(),
    removeAllPoints: jest.fn(),
    setClamping: jest.fn(),
    setNodes: jest.fn(),
  };
}

/**
 * The labelmap's style, as segmentationStyle.getStyle gives it: the defaults,
 * then the style of the labelmap, then the one of the segment asked for.
 */
function setStyle(
  style: LabelmapStyle = {},
  perSegment: Record<number, LabelmapStyle> = {}
) {
  (segmentationStyle.getStyle as jest.Mock).mockImplementation(
    ({ segmentIndex }) => ({
      ...getDefaultLabelmapStyle(),
      ...style,
      ...(segmentIndex === undefined ? {} : perSegment[segmentIndex]),
    })
  );
}

function setHiddenSegments(...segmentIndices: number[]) {
  (internalGetHiddenSegmentIndices as jest.Mock).mockReturnValue(
    new Set(segmentIndices)
  );
}

/**
 * A volume actor as setLabelmapColorAndOpacity sees it. With `combined`, it is
 * the one addVolumesAsIndependentComponents makes for a MIP: the base volume
 * and the labelmap in one actor, which takes the label transfer functions
 * through preLoad as those of its second component.
 */
function createActorEntry({
  blendMode,
  combined = false,
}: {
  blendMode?: number;
  combined?: boolean;
}) {
  const property = {
    modified: jest.fn(),
    setInterpolationTypeToNearest: jest.fn(),
    setLabelOutlineOpacity: jest.fn(),
    setLabelOutlineThickness: jest.fn(),
    setRGBTransferFunction: jest.fn(),
    setScalarOpacity: jest.fn(),
    setUseLabelOutline: jest.fn(),
  };
  const mapper = {
    modified: jest.fn(),
    ...(blendMode === undefined ? {} : { getBlendMode: () => blendMode }),
  };
  const preLoad = jest.fn();
  const actor = {
    get: jest.fn(() => ({ preLoad: combined ? preLoad : undefined })),
    getMapper: jest.fn(() => mapper),
    getProperty: jest.fn(() => property),
    modified: jest.fn(),
    setVisibility: jest.fn(),
  };

  return {
    actorEntry: { uid: 'actor', actor } as unknown as Types.ActorEntry,
    mapper,
    preLoad,
    property,
  };
}

/** The opacity of each label, in the opacity function given to the actor. */
function getOpacities({
  preLoad,
  property,
}: ReturnType<typeof createActorEntry>): Record<number, number> {
  const ofun = preLoad.mock.calls.length
    ? preLoad.mock.lastCall[0].ofun
    : property.setScalarOpacity.mock.lastCall[1];
  const nodes = ofun.setNodes.mock.lastCall[0] as OpacityNode[];

  return Object.fromEntries(nodes.map(({ x, y }) => [x, y]));
}

function getOutlineThicknesses({
  property,
}: ReturnType<typeof createActorEntry>): number[] {
  return property.setLabelOutlineThickness.mock.lastCall[0];
}

function render(entry: ReturnType<typeof createActorEntry>) {
  setLabelmapColorAndOpacity(viewportId, entry.actorEntry, representation);

  return getOpacities(entry);
}

describe('setLabelmapColorAndOpacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (getActiveSegmentation as jest.Mock).mockReturnValue({ segmentationId });
    (getColorLUT as jest.Mock).mockReturnValue(colorLUT);
    (getSegmentation as jest.Mock).mockReturnValue({
      segmentationId,
      segments: { 1: {}, 2: {}, 3: {} },
    });
    setHiddenSegments();
    setStyle();
  });

  describe('on an actor that draws the edge projection of a MIP', () => {
    const createEdgeProjectionEntry = () =>
      createActorEntry({
        blendMode: LABELMAP_EDGE_PROJECTION_BLEND,
        combined: true,
      });

    it('gives each label the outline opacity, not the fill opacity', () => {
      setStyle({ fillAlpha: 0.2, outlineOpacity: 0.8 });

      const opacities = render(createEdgeProjectionEntry());

      expect(opacities[0]).toBe(0);
      expect(opacities[1]).toBeCloseTo(0.8);
      // The color's own alpha still applies.
      expect(opacities[2]).toBeCloseTo(0.4);
      expect(opacities[3]).toBeCloseTo(0.8);
    });

    it('keeps the outlines of an outline-only style visible', () => {
      setStyle({ renderFill: false, outlineOpacity: 1 });

      const opacities = render(createEdgeProjectionEntry());

      expect(opacities[1]).toBe(1);
      expect(opacities[2]).toBeCloseTo(0.5);
      expect(opacities[3]).toBe(1);
    });

    it('keeps the outlines of a transparent fill visible', () => {
      setStyle({ fillAlpha: 0, outlineOpacity: 1 });

      expect(render(createEdgeProjectionEntry())[1]).toBe(1);
    });

    it('uses the inactive outline opacity for an inactive segmentation', () => {
      (getActiveSegmentation as jest.Mock).mockReturnValue({
        segmentationId: 'another',
      });
      setStyle({
        fillAlphaInactive: 0.2,
        outlineOpacity: 1,
        outlineOpacityInactive: 0.3,
      });

      const opacities = render(createEdgeProjectionEntry());

      expect(opacities[1]).toBeCloseTo(0.3);
      expect(opacities[2]).toBeCloseTo(0.15);
    });

    it('uses the outline opacity of a segment that has its own style', () => {
      setStyle({ outlineOpacity: 0.8 }, { 3: { outlineOpacity: 0.25 } });

      const opacities = render(createEdgeProjectionEntry());

      expect(opacities[1]).toBeCloseTo(0.8);
      expect(opacities[3]).toBeCloseTo(0.25);
    });

    it('draws no outline for a hidden segment', () => {
      setStyle({ outlineOpacity: 0.8 });
      setHiddenSegments(2);

      const entry = createEdgeProjectionEntry();
      const opacities = render(entry);

      expect(opacities[1]).toBeCloseTo(0.8);
      expect(opacities[2]).toBe(0);
      expect(getOutlineThicknesses(entry)).toEqual([3, 0, 3]);
    });

    it('draws no outline with renderOutline off', () => {
      setStyle({ renderOutline: false, outlineOpacity: 0.8, fillAlpha: 0.6 });

      const entry = createEdgeProjectionEntry();
      const opacities = render(entry);

      expect(opacities).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
      expect(getOutlineThicknesses(entry)).toEqual([0, 0, 0]);
    });

    it('follows the style and the visibility as they change', () => {
      const entry = createEdgeProjectionEntry();

      setStyle({ outlineOpacity: 0.8 });
      expect(render(entry)[1]).toBeCloseTo(0.8);

      setStyle({ outlineOpacity: 0.4 });
      expect(render(entry)[1]).toBeCloseTo(0.4);

      setHiddenSegments(1);
      expect(render(entry)[1]).toBe(0);

      setHiddenSegments();
      expect(render(entry)[1]).toBeCloseTo(0.4);
      expect(entry.preLoad).toHaveBeenCalledTimes(4);
    });

    it('hands the transfer functions to the combined actor through preLoad', () => {
      const entry = createEdgeProjectionEntry();

      render(entry);

      // They are those of the actor's second component, set by preLoad: the
      // first one's are the base volume's.
      expect(entry.preLoad).toHaveBeenCalledTimes(1);
      expect(entry.property.setScalarOpacity).not.toHaveBeenCalled();
      expect(entry.property.setRGBTransferFunction).not.toHaveBeenCalled();
    });
  });

  describe('on any other actor', () => {
    const createOtherEntries = () => ({
      'a volume actor in another blend mode': createActorEntry({
        blendMode: MAXIMUM_INTENSITY_BLEND,
      }),
      'an actor whose mapper has no blend mode': createActorEntry({}),
      'a combined actor the viewport gave another blend mode': createActorEntry(
        { blendMode: MAXIMUM_INTENSITY_BLEND, combined: true }
      ),
    });

    it('gives each label the fill opacity, not the outline opacity', () => {
      setStyle({ fillAlpha: 0.2, outlineOpacity: 0.8 });

      for (const [name, entry] of Object.entries(createOtherEntries())) {
        const opacities = render(entry);

        expect([name, opacities[0]]).toEqual([name, 0]);
        expect([name, opacities[1]]).toEqual([name, 0.2]);
        expect([name, opacities[2]]).toEqual([name, 0.1]);
        expect([name, opacities[3]]).toEqual([name, 0.2]);
      }
    });

    it('keeps a faint fill under the outlines of an outline-only style', () => {
      setStyle({ renderFill: false, outlineOpacity: 0.8 });

      for (const [name, entry] of Object.entries(createOtherEntries())) {
        const opacities = render(entry);

        expect([name, opacities]).toEqual([
          name,
          { 0: 0, 1: 0.01, 2: 0.01, 3: 0.01 },
        ]);
        expect(entry.property.setLabelOutlineOpacity).toHaveBeenCalledWith(0.8);
      }
    });

    it('keeps the fill with renderOutline off', () => {
      setStyle({ renderOutline: false, fillAlpha: 0.6 });

      for (const [name, entry] of Object.entries(createOtherEntries())) {
        const opacities = render(entry);

        expect([name, opacities[1]]).toEqual([name, 0.6]);
        expect(getOutlineThicknesses(entry)).toEqual([0, 0, 0]);
      }
    });

    it('uses the fill opacity of a segment that has its own style', () => {
      setStyle(
        { fillAlpha: 0.2 },
        { 3: { fillAlpha: 0.7, outlineOpacity: 0 } }
      );

      const opacities = render(
        createActorEntry({ blendMode: MAXIMUM_INTENSITY_BLEND })
      );

      expect(opacities[1]).toBe(0.2);
      expect(opacities[3]).toBe(0.7);
    });

    it('gives a hidden segment no fill', () => {
      setStyle({ fillAlpha: 0.2 });
      setHiddenSegments(1);

      const opacities = render(
        createActorEntry({ blendMode: MAXIMUM_INTENSITY_BLEND })
      );

      expect(opacities[1]).toBe(0);
      expect(opacities[3]).toBe(0.2);
    });
  });
});
