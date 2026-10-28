import { computeECGTraceGeometry } from '../src/RenderingEngine/GenericViewport/ECG/ecgGeometry';
import {
  resolveECGTraceCells,
  resolveECGTraceLayout,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgTraceLayouts';

const NUMBER_OF_SAMPLES = 5000;
const ECG_WIDTH = 1000;
const TARGET_HEIGHT = 600;

function makeChannel(name, { min = -100, max = 100, length = 512 } = {}) {
  return {
    name,
    data: new Int16Array(length),
    min,
    max,
  };
}

const TWELVE_LEAD_NAMES = [
  'Lead I',
  'Lead II',
  'Lead III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
];

function makeChannels(names) {
  return names.map((name) => makeChannel(name));
}

function geometryFor(channels, traceLayout, visibleChannels) {
  const cells = resolveECGTraceCells({
    definition: resolveECGTraceLayout(traceLayout, { channels }),
    channels,
    numberOfSamples: NUMBER_OF_SAMPLES,
    viewSampleWindow: [0, NUMBER_OF_SAMPLES],
    visibleChannels,
  });

  return computeECGTraceGeometry({
    cells,
    ecgWidth: ECG_WIDTH,
    targetHeight: TARGET_HEIGHT,
  });
}

function layoutsFor(channels, traceLayout, visibleChannels) {
  return geometryFor(channels, traceLayout, visibleChannels).layouts;
}

const isRhythm = (channels) => (layout) => layout.leadIndex >= channels.length;

describe('ECG trace layouts in world space', () => {
  describe('leadIndex identifies one region', () => {
    it('uses the unfiltered channel index when a lead is hidden', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '12x1', [0, 5, 11]);

      expect(layouts.map((layout) => layout.leadIndex)).toEqual([0, 5, 11]);
    });

    it('gives every region of a layout a different leadIndex', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);

      ['12x1', '6x2', '3x4', '3x4+1'].forEach((traceLayout) => {
        const layouts = layoutsFor(channels, traceLayout);
        const leadIndices = layouts.map((layout) => layout.leadIndex);

        expect(new Set(leadIndices).size).toBe(layouts.length);
      });
    });

    it('gives the 3x4+1 rhythm strip an index above the channels', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.filter(isRhythm(channels));

      expect(rhythm).toHaveLength(1);
      expect(rhythm[0].channel.name).toBe('Lead II');
      expect(rhythm[0].leadIndex).toBe(channels.length);

      // The grid region of lead II keeps its own index.
      const gridLeadTwo = layouts.find((layout) => layout.leadIndex === 1);
      expect(gridLeadTwo.channel.name).toBe('Lead II');
    });

    it('does not select lead III as the rhythm lead', () => {
      const channels = makeChannels(['Lead III', 'Lead aVR', 'Lead II']);
      const rhythm = layoutsFor(channels, '3x4+1').find(isRhythm(channels));

      expect(rhythm.channel.name).toBe('Lead II');
    });

    it('gives the rhythm strip the full record and a grid region a quarter', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.find(isRhythm(channels));
      const gridLeadTwo = layouts.find((layout) => layout.leadIndex === 1);

      expect(rhythm.startSample).toBe(0);
      expect(rhythm.endSample).toBe(NUMBER_OF_SAMPLES);
      expect(rhythm.width).toBe(ECG_WIDTH);

      expect(gridLeadTwo.startSample).toBe(0);
      expect(gridLeadTwo.endSample).toBe(NUMBER_OF_SAMPLES / 4);
      expect(gridLeadTwo.width).toBe(ECG_WIDTH / 4);
    });
  });

  describe('the layout keeps every lead', () => {
    it('gives a 15-lead waveform 15 rows in the 12x1 layout', () => {
      const channels = makeChannels([...TWELVE_LEAD_NAMES, 'V7', 'V8', 'V9']);
      const layouts = layoutsFor(channels, '12x1');

      expect(layouts.map((layout) => layout.leadIndex)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ]);
    });

    it('gives a 15-lead waveform 5 columns in the 3x4 layout', () => {
      const channels = makeChannels([...TWELVE_LEAD_NAMES, 'V7', 'V8', 'V9']);
      const layouts = layoutsFor(channels, '3x4');

      expect(layouts).toHaveLength(15);
      // Each of the 5 columns covers one fifth of the signal.
      layouts.forEach((layout) => {
        expect(layout.width).toBeCloseTo(ECG_WIDTH / 5);
        expect(layout.endSample - layout.startSample).toBe(
          NUMBER_OF_SAMPLES / 5
        );
      });
    });

    it('leaves no empty band for hidden leads in 12x1', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const { layouts, ecgHeight } = geometryFor(
        channels,
        '12x1',
        [0, 1, 2, 3, 4, 5, 6, 7]
      );

      expect(layouts).toHaveLength(8);
      // The 8 bands share the full height.
      expect(Math.max(...layouts.map((layout) => layout.yOffset))).toBeCloseTo(
        ecgHeight,
        6
      );
      expect(layouts[0].yOffset).toBeCloseTo(ecgHeight / 8, 6);
    });

    it('marks a channel that holds no samples as hidden', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      channels[3].data = new Int16Array(0);

      const leadIndices = layoutsFor(channels, '12x1').map(
        (layout) => layout.leadIndex
      );

      expect(leadIndices).not.toContain(3);
      expect(leadIndices).toHaveLength(11);
    });
  });

  it.each(['12x1', '6x2', '3x4', '3x4+1'])(
    'keeps every region of %s inside the world height',
    (traceLayout) => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const { layouts, ecgHeight } = geometryFor(channels, traceLayout);

      layouts.forEach((layout) => {
        expect(layout.yOffset).toBeLessThanOrEqual(ecgHeight + 1e-6);
        expect(layout.yOffset - layout.itemHeight).toBeGreaterThanOrEqual(0);
      });
    }
  );
});
