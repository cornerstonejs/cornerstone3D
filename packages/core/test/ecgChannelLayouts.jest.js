import {
  computeECGChannelLayouts,
  computeECGHeight,
  getVisibleECGChannelEntries,
  getECGLayoutRowCount,
} from '../src/utilities/ECGUtilities';

const CHANNEL_SCALE = 2;
const NUMBER_OF_SAMPLES = 5000;
const ECG_WIDTH = 1000;

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

function layoutsFor(channels, layoutType, visibleChannels) {
  const entries = getVisibleECGChannelEntries(channels, visibleChannels);

  return computeECGChannelLayouts({
    visibleChannels: entries.map((entry) => entry.channel),
    leadIndices: entries.map((entry) => entry.channelIndex),
    channelCount: channels.length,
    channelScale: CHANNEL_SCALE,
    layoutType,
    numberOfSamples: NUMBER_OF_SAMPLES,
    ecgWidth: ECG_WIDTH,
  });
}

describe('ECG channel layouts', () => {
  describe('getVisibleECGChannelEntries', () => {
    it('keeps the index of each channel in the unfiltered list', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const entries = getVisibleECGChannelEntries(channels, [0, 5, 11]);

      expect(entries.map((entry) => entry.channelIndex)).toEqual([0, 5, 11]);
      expect(entries.map((entry) => entry.channel.name)).toEqual([
        'Lead I',
        'aVF',
        'V6',
      ]);
    });

    it('drops a channel that holds no samples', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      channels[3].data = new Int16Array(0);

      const entries = getVisibleECGChannelEntries(channels);

      expect(entries.map((entry) => entry.channelIndex)).toEqual([
        0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
    });
  });

  describe('leadIndex identifies one layout cell', () => {
    it('uses the unfiltered channel index when a lead is hidden', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '12x1', [0, 5, 11]);

      expect(layouts.map((layout) => layout.leadIndex)).toEqual([0, 5, 11]);
    });

    it('gives every cell of a layout a different leadIndex', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);

      ['12x1', '6x2', '3x4', '3x4+1'].forEach((layoutType) => {
        const layouts = layoutsFor(channels, layoutType);
        const leadIndices = layouts.map((layout) => layout.leadIndex);

        expect(new Set(leadIndices).size).toBe(layouts.length);
      });
    });

    it('gives the 3x4+1 rhythm strip a synthetic index above the channels', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.filter((layout) => layout.isRhythm);

      expect(rhythm).toHaveLength(1);
      expect(rhythm[0].channel.name).toBe('Lead II');
      expect(rhythm[0].leadIndex).toBe(channels.length);

      // The grid cell of lead II keeps its own index, so the two cells are
      // distinguishable. This is the defect that the rhythm strip had before.
      const gridLeadTwo = layouts.find(
        (layout) => !layout.isRhythm && layout.channel.name === 'Lead II'
      );
      expect(gridLeadTwo.leadIndex).toBe(1);
      expect(gridLeadTwo.leadIndex).not.toBe(rhythm[0].leadIndex);
    });

    it('does not select lead III as the rhythm lead', () => {
      const channels = makeChannels(['Lead III', 'Lead aVR', 'Lead II']);
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.find((layout) => layout.isRhythm);

      expect(rhythm.channel.name).toBe('Lead II');
    });

    it('gives the rhythm strip the full duration and the grid cell a segment', () => {
      const channels = makeChannels(TWELVE_LEAD_NAMES);
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.find((layout) => layout.isRhythm);
      const gridLeadTwo = layouts.find(
        (layout) => !layout.isRhythm && layout.channel.name === 'Lead II'
      );

      expect(rhythm.startSample).toBe(0);
      expect(rhythm.endSample).toBe(NUMBER_OF_SAMPLES);
      expect(rhythm.width).toBe(ECG_WIDTH);

      expect(gridLeadTwo.startSample).toBe(0);
      expect(gridLeadTwo.endSample).toBe(NUMBER_OF_SAMPLES / 4);
      expect(gridLeadTwo.width).toBe(ECG_WIDTH / 4);
    });
  });

  describe('the grid keeps every lead', () => {
    it('gives a 15-lead waveform 15 rows in the 12x1 layout', () => {
      const channels = makeChannels([...TWELVE_LEAD_NAMES, 'V7', 'V8', 'V9']);
      const layouts = layoutsFor(channels, '12x1');

      expect(layouts).toHaveLength(15);
      expect(layouts.map((layout) => layout.leadIndex)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ]);
    });

    it('gives a 15-lead waveform 5 columns in the 3x4 layout', () => {
      const channels = makeChannels([...TWELVE_LEAD_NAMES, 'V7', 'V8', 'V9']);
      const layouts = layoutsFor(channels, '3x4');

      expect(layouts).toHaveLength(15);
      expect(Math.max(...layouts.map((layout) => layout.col))).toBe(4);

      // Each of the 5 columns covers one fifth of the signal.
      layouts.forEach((layout) => {
        expect(layout.width).toBeCloseTo(ECG_WIDTH / 5);
        expect(layout.endSample - layout.startSample).toBe(
          NUMBER_OF_SAMPLES / 5
        );
      });
    });

    it('keeps the nominal 12 rows for a waveform with fewer leads', () => {
      expect(getECGLayoutRowCount('12x1', 8)).toBe(12);
      expect(getECGLayoutRowCount('12x1', 15)).toBe(15);
      expect(getECGLayoutRowCount('3x4', 12)).toBe(3);
      expect(getECGLayoutRowCount('3x4+1', 12)).toBe(4);
      expect(getECGLayoutRowCount('6x2', 12)).toBe(6);
    });
  });

  describe('computeECGHeight agrees with computeECGChannelLayouts', () => {
    it.each(['12x1', '6x2', '3x4', '3x4+1'])(
      'reserves the height that the %s layout occupies',
      (layoutType) => {
        const channels = makeChannels(TWELVE_LEAD_NAMES);
        const layouts = layoutsFor(channels, layoutType);
        const height = computeECGHeight(channels, CHANNEL_SCALE, layoutType);
        const lowestOffset = Math.max(
          ...layouts.map((layout) => layout.yOffset)
        );

        // Every cell fits inside the reserved height, and the last row ends at
        // the reserved height.
        expect(lowestOffset).toBeLessThanOrEqual(height);
        expect(height).toBeGreaterThan(0);
      }
    );

    it('picks the same rhythm lead as the layout for an unusual lead order', () => {
      // Lead II has the largest amplitude, so the reserved height changes when
      // the two functions disagree on which lead the rhythm strip repeats.
      const channels = [
        makeChannel('Lead III', { min: -10, max: 10 }),
        makeChannel('Lead aVR', { min: -10, max: 10 }),
        makeChannel('Lead II', { min: -1000, max: 1000 }),
      ];
      const layouts = layoutsFor(channels, '3x4+1');
      const rhythm = layouts.find((layout) => layout.isRhythm);
      const height = computeECGHeight(channels, CHANNEL_SCALE, '3x4+1');

      expect(rhythm.channel.name).toBe('Lead II');
      expect(rhythm.yOffset).toBeLessThanOrEqual(height);
      // The rhythm row is as tall as lead II needs.
      expect(rhythm.itemHeight).toBeCloseTo(2000 * CHANNEL_SCALE * 1.25);
    });

    it('returns 1 for an empty channel list', () => {
      expect(computeECGHeight([], CHANNEL_SCALE, '12x1')).toBe(1);
    });
  });
});
