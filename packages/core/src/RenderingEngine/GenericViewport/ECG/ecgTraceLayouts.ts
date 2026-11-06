import type {
  ECGTraceLayout,
  ECGTraceLayoutContext,
  ECGTraceLayoutDefinition,
  ECGTraceLayoutFactory,
  ECGTraceLayoutRegistry,
  ECGTraceRegion,
} from './ECGViewportTypes';
import type { ECGChannelLike } from './ecgWaveform';

const DEFAULT_TRACE_LAYOUT = '12x1';

/** Lead code values of lead II, in SCPECG and in MDC. */
const LEAD_II_CODES = new Set(['5.6.3-9-2', '2:2']);

const traceLayouts = new Map<string, ECGTraceLayoutFactory>();
const warnedNames = new Set<string>();

/**
 * Registers a named trace layout. Declare the name in `ECGTraceLayoutRegistry`
 * first, so that the name is discoverable in the type.
 *
 * @param name - The layout name.
 * @param layout - A definition, or a factory that builds the definition for
 *   the channels of one waveform.
 */
export function registerECGTraceLayout<
  Name extends keyof ECGTraceLayoutRegistry,
>(name: Name, layout: ECGTraceLayoutDefinition | ECGTraceLayoutFactory): void {
  if (traceLayouts.has(name)) {
    throw new Error(`ECG trace layout "${name}" is already registered`);
  }

  traceLayouts.set(name, typeof layout === 'function' ? layout : () => layout);
}

/** Returns the names of every registered trace layout. */
export function getECGTraceLayoutNames(): string[] {
  return Array.from(traceLayouts.keys());
}

/**
 * Returns the definition of a trace layout for the channels of one waveform.
 * A definition is returned as it is. An unknown name returns undefined.
 */
export function getECGTraceLayout(
  traceLayout: ECGTraceLayout,
  context: ECGTraceLayoutContext
): ECGTraceLayoutDefinition | undefined {
  if (typeof traceLayout !== 'string') {
    return traceLayout;
  }

  return traceLayouts.get(traceLayout)?.(context);
}

/**
 * Returns the definition of `traceLayout`, or of `'12x1'` when the name is
 * unknown. An unknown name logs one warning.
 */
export function resolveECGTraceLayout(
  traceLayout: ECGTraceLayout | undefined,
  context: ECGTraceLayoutContext
): ECGTraceLayoutDefinition {
  const definition = getECGTraceLayout(
    traceLayout ?? DEFAULT_TRACE_LAYOUT,
    context
  );

  if (definition) {
    return definition;
  }

  if (!warnedNames.has(traceLayout as string)) {
    warnedNames.add(traceLayout as string);
    console.warn(
      `[ECG] Unknown trace layout "${traceLayout}", using "${DEFAULT_TRACE_LAYOUT}"`
    );
  }

  return getECGTraceLayout(DEFAULT_TRACE_LAYOUT, context);
}

/** True when a region of the layout follows the time window of the view. */
export function hasViewTimeRegion(definition: ECGTraceLayoutDefinition) {
  return definition.regions.some(
    (region) => (region.time ?? 'view') === 'view'
  );
}

/** One region of a layout, resolved to a channel and a sample range. */
export interface ECGTraceCell<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  region: ECGTraceRegion;
  regionIndex: number;
  channel: TChannel;
  channelIndex: number;
  /**
   * The Z of a world point in this region. The first region of a lead uses
   * the channel index, so the value does not change with the layout or with
   * the visible leads. A region that repeats a lead gets a value above the
   * last channel index.
   */
  leadIndex: number;
  visible: boolean;
  startSample: number;
  endSample: number;
  label: string;
}

/**
 * Resolves the regions of a definition to channels and sample ranges. A region
 * whose lead matches no channel is left out.
 */
export function resolveECGTraceCells<TChannel extends ECGChannelLike>(args: {
  definition: ECGTraceLayoutDefinition;
  channels: TChannel[];
  numberOfSamples: number;
  /** Sample range `[start, end)` of the regions with `time: 'view'`. */
  viewSampleWindow: [number, number];
  /** Visible channel indices. Undefined shows every channel. */
  visibleChannels?: number[];
}): ECGTraceCell<TChannel>[] {
  const {
    definition,
    channels,
    numberOfSamples,
    viewSampleWindow,
    visibleChannels,
  } = args;
  const visible = visibleChannels ? new Set(visibleChannels) : undefined;
  const usedChannels = new Set<number>();
  let nextRepeatIndex = channels.length;
  const cells: ECGTraceCell<TChannel>[] = [];

  definition.regions.forEach((region, regionIndex) => {
    const channelIndex =
      typeof region.lead === 'number'
        ? region.lead
        : findLeadByCode(channels, region.lead);
    const channel = channels[channelIndex];

    if (!channel) {
      return;
    }

    const leadIndex = usedChannels.has(channelIndex)
      ? nextRepeatIndex++
      : channelIndex;
    usedChannels.add(channelIndex);

    const time = region.time ?? 'view';
    const [startSample, endSample] =
      time === 'view'
        ? viewSampleWindow
        : [
            Math.floor(clamp01(time[0]) * numberOfSamples),
            Math.floor(clamp01(time[1]) * numberOfSamples),
          ];

    cells.push({
      region,
      regionIndex,
      channel,
      channelIndex,
      leadIndex,
      visible:
        channel.data.length > 0 &&
        channel.visible !== false &&
        (!visible || visible.has(channelIndex)),
      startSample,
      endSample,
      label: region.label ?? channel.name,
    });
  });

  return cells;
}

/**
 * Index of the channel whose lead code value is `lead`. A channel with no code
 * value matches by its code meaning, the channel name, in place of the code.
 */
function findLeadByCode(
  channels: { name: string; code?: string }[],
  lead: string
): number {
  const byCode = channels.findIndex((channel) => channel.code === lead);

  return byCode >= 0
    ? byCode
    : channels.findIndex((channel) => !channel.code && channel.name === lead);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Index of lead II by its code value, then by its name, then the second channel. */
function findLeadII(channels: ECGTraceLayoutContext['channels']): number {
  const byCode = channels.findIndex((channel) =>
    LEAD_II_CODES.has(channel.code)
  );

  if (byCode >= 0) {
    return byCode;
  }

  const byName = channels.findIndex((channel) =>
    /\bii\b/.test((channel.name ?? '').toLowerCase())
  );

  if (byName >= 0) {
    return byName;
  }

  return channels.length > 1 ? 1 : 0;
}

/** One full-width row for each channel, with the time window of the view. */
function createRowsLayout({
  channels,
}: ECGTraceLayoutContext): ECGTraceLayoutDefinition {
  const count = channels.length;

  return {
    regions: channels.map((_channel, index) => ({
      lead: index,
      bounds: {
        minX: 0,
        maxX: 1,
        minY: index / count,
        maxY: (index + 1) / count,
      },
      time: 'view',
    })),
  };
}

/**
 * A grid that fills each column with `rowsPerColumn` leads. Each column shows
 * its own part of the record. The grid adds columns when the waveform holds
 * more leads than the nominal grid.
 */
function createGridLayout(
  rowsPerColumn: number,
  nominalColumns: number,
  withRhythmStrip: boolean
): ECGTraceLayoutFactory {
  return ({ channels }) => {
    const columns = Math.max(
      nominalColumns,
      Math.ceil(channels.length / rowsPerColumn)
    );
    const totalRows = rowsPerColumn + (withRhythmStrip ? 1 : 0);
    const regions: ECGTraceRegion[] = channels.map((_channel, index) => {
      const column = Math.floor(index / rowsPerColumn);
      const row = index % rowsPerColumn;

      return {
        lead: index,
        bounds: {
          minX: column / columns,
          maxX: (column + 1) / columns,
          minY: row / totalRows,
          maxY: (row + 1) / totalRows,
        },
        time: [column / columns, (column + 1) / columns],
      };
    });

    if (withRhythmStrip && channels.length) {
      regions.push({
        id: 'rhythm',
        lead: findLeadII(channels),
        bounds: { minX: 0, maxX: 1, minY: rowsPerColumn / totalRows, maxY: 1 },
        time: [0, 1],
      });
    }

    return { regions };
  };
}

registerECGTraceLayout('12x1', createRowsLayout);
registerECGTraceLayout('6x2', createGridLayout(6, 2, false));
registerECGTraceLayout('3x4', createGridLayout(3, 4, false));
registerECGTraceLayout('3x4+1', createGridLayout(3, 4, true));
