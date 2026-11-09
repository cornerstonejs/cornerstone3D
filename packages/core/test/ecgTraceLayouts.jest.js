import {
  getECGTraceLayout,
  getECGTraceLayoutNames,
  registerECGTraceLayout,
  resolveDefaultECGTraceLayout,
  resolveECGTraceCells,
  resolveECGTraceLayout,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgTraceLayouts';

const NUMBER_OF_SAMPLES = 1000;

/** Leads in an unusual order, with SCPECG code values. */
const CHANNELS = [
  { name: 'V1', code: '5.6.3-9-3' },
  { name: 'Ableitung II', code: '5.6.3-9-2' },
  { name: 'I', code: '5.6.3-9-1' },
].map((channel) => ({
  ...channel,
  data: new Int16Array(NUMBER_OF_SAMPLES),
  min: -100,
  max: 100,
}));

function cellsFor(traceLayout) {
  return resolveECGTraceCells({
    definition: resolveECGTraceLayout(traceLayout, { channels: CHANNELS }),
    channels: CHANNELS,
    numberOfSamples: NUMBER_OF_SAMPLES,
    viewSampleWindow: [0, NUMBER_OF_SAMPLES],
  });
}

describe('ECG trace layouts', () => {
  it('lists the built-in names, and a registered name', () => {
    registerECGTraceLayout('test:single', {
      regions: [{ lead: 0, bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } }],
    });

    expect(getECGTraceLayoutNames()).toEqual(
      expect.arrayContaining(['12x1', '6x2', '3x4', '3x4+1', 'test:single'])
    );
    expect(getECGTraceLayout('test:single', { channels: CHANNELS })).toEqual({
      regions: [{ lead: 0, bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } }],
    });
    expect(() =>
      registerECGTraceLayout('test:single', { regions: [] })
    ).toThrow();
  });

  it('accepts a full definition in place of a name', () => {
    const cells = cellsFor({
      regions: [
        {
          lead: '5.6.3-9-2',
          label: 'II',
          bounds: { minX: 0, maxX: 0.5, minY: 0, maxY: 1 },
          time: [0.5, 1],
        },
      ],
    });

    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      channelIndex: 1,
      label: 'II',
      startSample: 500,
      endSample: 1000,
    });
  });

  it('finds a lead by its code value, whatever the language of its name', () => {
    const rhythm = cellsFor('3x4+1').find(
      (cell) => cell.region.id === 'rhythm'
    );

    expect(rhythm.channelIndex).toBe(1);
    // The rhythm strip is the second copy of lead II: 1 + 1000.
    expect(rhythm.leadIndex).toBe(1001);
  });

  it('matches a channel with no code value by its code meaning', () => {
    const channels = [
      {
        name: 'Lead I',
        data: new Int16Array(NUMBER_OF_SAMPLES),
        min: 0,
        max: 1,
      },
      {
        name: 'Lead II',
        data: new Int16Array(NUMBER_OF_SAMPLES),
        min: 0,
        max: 1,
      },
    ];
    const cells = resolveECGTraceCells({
      definition: {
        regions: [
          { lead: 'Lead II', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } },
        ],
      },
      channels,
      numberOfSamples: NUMBER_OF_SAMPLES,
      viewSampleWindow: [0, NUMBER_OF_SAMPLES],
    });

    expect(cells.map((cell) => cell.channelIndex)).toEqual([1]);
  });

  it('uses 12x1 for an unknown name', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(cellsFor('no-such-layout')).toHaveLength(CHANNELS.length);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  describe('dynamic trace layout resolution and choices', () => {
    const twelveLeads = [
      'I',
      'II',
      'III',
      'aVR',
      'aVL',
      'aVF',
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
    ].map((name) => ({ name, code: name }));

    const fifteenLeads = [
      ...twelveLeads,
      { name: 'V7', code: 'V7' },
      { name: 'V8', code: 'V8' },
      { name: 'V9', code: 'V9' },
    ];

    const long = { numberOfSamples: 5000, samplingFrequency: 500 };

    it('opens a long record of 8 or more leads in 3x4+1, and other records in rows', () => {
      expect(
        resolveDefaultECGTraceLayout({ channels: twelveLeads, ...long })
      ).toBe('3x4+1');
      expect(
        resolveDefaultECGTraceLayout({ channels: fifteenLeads, ...long })
      ).toBe('3x4+1');
      expect(
        resolveDefaultECGTraceLayout({
          channels: twelveLeads.slice(0, 3),
          ...long,
        })
      ).toBe('12x1');
      expect(
        resolveDefaultECGTraceLayout({
          channels: twelveLeads,
          numberOfSamples: 1000,
          samplingFrequency: 500,
        })
      ).toBe('12x1');
    });

    it('lists the registered names that suit the waveform, and keeps a custom name', () => {
      registerECGTraceLayout('test:custom', { regions: [] });

      expect(getECGTraceLayoutNames({ channels: twelveLeads })).toEqual(
        expect.arrayContaining(['3x4+1', '3x4', '6x2', '12x1', 'test:custom'])
      );
      expect(
        getECGTraceLayoutNames({ channels: twelveLeads.slice(0, 3) })
      ).toEqual(['12x1', 'test:single', 'test:custom']);
    });

    it('adds columns to 3x4+1 for 15 leads', () => {
      const definition = resolveECGTraceLayout('3x4+1', {
        channels: fifteenLeads,
        ...long,
      });

      expect(definition.regions).toHaveLength(16);
      expect(definition.regions.find((r) => r.id === 'rhythm')).toBeDefined();
    });

    it.each([4, 6, 8, 18, 21])(
      'gives %i leads a default layout that is listed and shows every lead',
      (leadCount) => {
        const context = {
          channels: Array.from({ length: leadCount }, (_, i) => ({
            name: `Lead ${i + 1}`,
            code: `lead-${i + 1}`,
          })),
          ...long,
        };
        const defaultLayout = resolveDefaultECGTraceLayout(context);
        const definition = resolveECGTraceLayout(defaultLayout, context);

        expect(getECGTraceLayoutNames(context)).toContain(defaultLayout);
        context.channels.forEach((_, lead) => {
          expect(definition.regions.some((r) => r.lead === lead)).toBe(true);
        });
      }
    );
  });
});
