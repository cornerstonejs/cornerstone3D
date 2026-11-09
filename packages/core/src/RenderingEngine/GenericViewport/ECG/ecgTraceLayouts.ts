import type {
  ECGTraceLayout,
  ECGTraceLayoutContext,
  ECGTraceLayoutName,
  ECGTraceLayoutRegistry,
  ECGTraceLayoutDefinition,
  ECGTraceLayoutFactory,
  ECGTraceRegion,
} from './ECGViewportTypes';
import type { ECGChannelLike } from './ecgWaveform';
import clamp from '../../../utilities/clamp';

/** Lead code values of lead II, in SCPECG and in MDC. */
const LEAD_II_CODES = new Set(['5.6.3-9-2', '2:2']);

/** The leads, and the duration, from which a grid layout is the default. */
const GRID_MIN_LEADS = 8;
const GRID_MIN_SECONDS = 5;

type ECGTraceLayoutSupports = (context: ECGTraceLayoutContext) => boolean;

const traceLayouts = new Map<
  string,
  { factory: ECGTraceLayoutFactory; supports?: ECGTraceLayoutSupports }
>();
const warnedNames = new Set<string>();

/**
 * Registers a named trace layout. Declare the name in `ECGTraceLayoutRegistry`
 * first, so that the name is discoverable in the type.
 *
 * @param name - The layout name.
 * @param layout - A definition, or a factory that builds the definition for
 *   the channels of one waveform.
 * @param options - `supports` tells {@link getECGTraceLayoutNames} if the
 *   layout suits a waveform. Without it, the layout suits every waveform.
 */
export function registerECGTraceLayout<
  Name extends keyof ECGTraceLayoutRegistry,
>(
  name: Name,
  layout: ECGTraceLayoutDefinition | ECGTraceLayoutFactory,
  options: { supports?: ECGTraceLayoutSupports } = {}
): void {
  if (traceLayouts.has(name)) {
    throw new Error(`ECG trace layout "${name}" is already registered`);
  }

  traceLayouts.set(name, {
    factory: typeof layout === 'function' ? layout : () => layout,
    supports: options.supports,
  });
}

/**
 * Returns the names of the registered trace layouts. With a waveform context,
 * it returns the names whose `supports` accepts the waveform.
 */
export function getECGTraceLayoutNames(
  context?: ECGTraceLayoutContext
): ECGTraceLayoutName[] {
  return Array.from(traceLayouts.entries())
    .filter(
      ([, entry]) => !context || !entry.supports || entry.supports(context)
    )
    .map(([name]) => name);
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

  return traceLayouts.get(traceLayout)?.factory(context);
}

/**
 * Returns the registered name of the default layout of a waveform: `'3x4+1'`
 * for a record of at least 8 leads and 5 s, else `'12x1'` (one row for each
 * lead). A record of unknown duration counts as long.
 */
export function resolveDefaultECGTraceLayout(
  context: ECGTraceLayoutContext
): ECGTraceLayoutName {
  const { channels, numberOfSamples = 0, samplingFrequency = 0 } = context;
  const isLong =
    !(numberOfSamples > 0 && samplingFrequency > 0) ||
    numberOfSamples / samplingFrequency >= GRID_MIN_SECONDS;

  return channels.length >= GRID_MIN_LEADS && isLong ? '3x4+1' : '12x1';
}

/**
 * Returns the definition of `traceLayout`. An undefined layout, or an unknown
 * name, gives the default layout of the waveform. An unknown name logs one
 * warning.
 */
export function resolveECGTraceLayout(
  traceLayout: ECGTraceLayout | undefined,
  context: ECGTraceLayoutContext
): ECGTraceLayoutDefinition {
  const defaultLayout = resolveDefaultECGTraceLayout(context);
  const definition = getECGTraceLayout(traceLayout ?? defaultLayout, context);

  if (definition) {
    return definition;
  }

  if (!warnedNames.has(traceLayout as string)) {
    warnedNames.add(traceLayout as string);
    console.warn(
      `[ECG] Unknown trace layout "${traceLayout}", using "${defaultLayout}"`
    );
  }

  return getECGTraceLayout(defaultLayout, context);
}

/** True when a region of the layout follows the time window of the view. */
export function hasViewTimeRegion(definition: ECGTraceLayoutDefinition) {
  return definition.regions.some(
    (region) => (region.time ?? 'view') === 'view'
  );
}

/** The step of world Z between two copies of one lead. */
export const ECG_LEAD_COPY_STRIDE = 1000;

/** The multiplex group that a waveform shows, and the group count of the instance. */
export interface ECGLeadGroup {
  index: number;
  count: number;
}

const SINGLE_GROUP: ECGLeadGroup = { index: 0, count: 1 };

/**
 * World Z of copy `copy` of channel `channelIndex` in multiplex group
 * `group.index`: `channelIndex + ECG_LEAD_COPY_STRIDE * k`, with
 * `k = copy * group.count + group.index`. The k index counts across all the
 * groups of the instance, so two groups never share a Z, and an annotation of
 * one group does not show on another group. An instance with one group gives
 * `k = copy`: the first copy of a lead is its channel index.
 */
export function getECGLeadZ(
  channelIndex: number,
  copy: number,
  group: ECGLeadGroup = SINGLE_GROUP
): number {
  return (
    channelIndex + ECG_LEAD_COPY_STRIDE * (copy * group.count + group.index)
  );
}

/**
 * Returns the layout of world Z: the region of that copy of the lead, else
 * the first region of the lead in the same group, when the layout does not
 * show the copy. A Z of another group finds no layout.
 */
export function findECGLayoutForZ<T extends { leadIndex: number }>(
  layouts: T[],
  z: number,
  group: ECGLeadGroup = SINGLE_GROUP
): T | undefined {
  const exact = layouts.find((item) => item.leadIndex === z);

  if (exact) {
    return exact;
  }
  const k = Math.floor(z / ECG_LEAD_COPY_STRIDE);

  if (k < 0 || k % group.count !== group.index) {
    return;
  }
  const baseZ = getECGLeadZ(z % ECG_LEAD_COPY_STRIDE, 0, group);

  return layouts.find((item) => item.leadIndex === baseZ);
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
   * The Z of a world point in this region; see {@link getECGLeadZ}. The value
   * does not change with the layout, the lead count or the visible leads.
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
  /** The multiplex group of the waveform. See {@link getECGLeadZ}. */
  group?: ECGLeadGroup;
}): ECGTraceCell<TChannel>[] {
  const {
    definition,
    channels,
    numberOfSamples,
    viewSampleWindow,
    visibleChannels,
    group,
  } = args;
  const visible = visibleChannels ? new Set(visibleChannels) : undefined;
  const copies = new Map<number, number>();
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

    const copy = copies.get(channelIndex) ?? 0;
    copies.set(channelIndex, copy + 1);
    const leadIndex = getECGLeadZ(channelIndex, copy, group);

    const time = region.time ?? 'view';
    const [startSample, endSample] =
      time === 'view'
        ? viewSampleWindow
        : [
            Math.floor(clamp(time[0], 0, 1) * numberOfSamples),
            Math.floor(clamp(time[1], 0, 1) * numberOfSamples),
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

const supportsGrid: ECGTraceLayoutSupports = ({ channels }) =>
  channels.length >= GRID_MIN_LEADS;

registerECGTraceLayout('12x1', createRowsLayout);
registerECGTraceLayout('6x2', createGridLayout(6, 2, false), {
  supports: supportsGrid,
});
registerECGTraceLayout('3x4', createGridLayout(3, 4, false), {
  supports: supportsGrid,
});
registerECGTraceLayout('3x4+1', createGridLayout(3, 4, true), {
  supports: supportsGrid,
});
