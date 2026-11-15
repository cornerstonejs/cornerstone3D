import type { VoxelQualityRecord } from '../../../types';
import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type { Panel } from './types';
import { CONVERSION, PANEL_CONFIG, PANEL_CONFIGS } from './constants';
import { PanelType } from './enums';

/**
 * Text panel that displays each viewport's GenericViewport bindings from its
 * internal debug map, public actor metadata, and volume {@link VoxelQualityRecord}s.
 */
export class RenderModesPanel implements Panel {
  public dom: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly summary: HTMLDivElement;
  private summarySignature = '';
  private sections = new Map<
    string,
    { signature: string; element: HTMLDivElement }
  >();

  constructor() {
    const config = PANEL_CONFIGS[PanelType.RENDER_MODES];
    this.dom = document.createElement('div');
    this.dom.style.cssText = `
      width:min(622px, max(${PANEL_CONFIG.WIDE_WIDTH}px, calc(100vw - ${
        PANEL_CONFIG.WIDTH + 24
      }px)));
      min-width:0;
      min-height:${PANEL_CONFIG.HEIGHT}px;
      background:${config.backgroundColor};
      color:${config.foregroundColor};
      font:${PANEL_CONFIG.FONT_SIZE + 2}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding:8px;
      box-sizing:border-box;
      max-height:min(520px, calc(100vh - 16px));
      overflow:auto;
      border:1px solid rgba(255, 204, 0, 0.35);
      border-radius:4px;
      box-shadow:0 8px 28px rgba(0, 0, 0, 0.35);
    `;

    const title = document.createElement('div');
    title.textContent = config.name;
    title.style.cssText = `
      margin-bottom:8px;
      font-weight:700;
      letter-spacing:0.08em;
      text-transform:uppercase;
    `;
    this.dom.appendChild(title);

    this.summary = document.createElement('div');
    this.summary.style.cssText = `
      display:none;
      margin-bottom:8px;
      color:#fff3bf;
    `;
    this.dom.appendChild(this.summary);

    this.list = document.createElement('div');
    this.list.style.cssText = `
      display:flex;
      flex-direction:column;
      gap:8px;
      line-height:1.35;
      font-weight:normal;
      color:#fff3bf;
    `;
    this.dom.appendChild(this.list);
  }

  /**
   * Implements the Panel numeric signature as a no-op; render-mode content is
   * refreshed via {@link setContent}.
   */
  public update(): void {
    // Content is pushed from StatsOverlay via setContent().
  }

  /**
   * Shows the entries, and the summary of the GPU texture memory above them
   * when one is given. A viewport section whose entry did not change since
   * the last call keeps its DOM, so a hover, a tooltip or a scroll position
   * in it survives the refresh, and a refresh with 10 viewports rebuilds
   * only the sections that changed.
   */
  public setContent(
    entries: RenderModePanelEntry[],
    summary?: RenderModePanelSummary
  ): void {
    this.setSummary(summary);

    if (!entries.length) {
      this.sections.clear();
      this.list.replaceChildren(createEmptyState('(no viewports)'));
      return;
    }

    const nextSections = new Map<
      string,
      { signature: string; element: HTMLDivElement }
    >();
    const elements: HTMLDivElement[] = [];
    const replaced: Array<[HTMLDivElement, HTMLDivElement]> = [];
    let sameLayout = this.sections.size === entries.length;

    entries.forEach((entry, index) => {
      const key = `${entry.renderingEngineId}/${entry.viewportId}`;
      const signature = getEntrySignature(entry);
      const previous = this.sections.get(key);
      const element =
        previous?.signature === signature
          ? previous.element
          : createSection(entry);

      if (
        !previous ||
        this.list.children[index] !== previous.element ||
        nextSections.has(key)
      ) {
        sameLayout = false;
      } else if (previous.element !== element) {
        replaced.push([previous.element, element]);
      }

      nextSections.set(key, { signature, element });
      elements.push(element);
    });

    if (sameLayout && this.list.children.length === elements.length) {
      for (const [previous, next] of replaced) {
        previous.replaceWith(next);
      }
    } else {
      this.list.replaceChildren(...elements);
    }

    this.sections = nextSections;
  }

  private setSummary(summary: RenderModePanelSummary | undefined): void {
    const signature = summary ? JSON.stringify(summary) : '';

    if (signature === this.summarySignature) {
      return;
    }

    this.summarySignature = signature;
    this.summary.replaceChildren();
    this.summary.style.display = summary ? 'block' : 'none';

    if (summary) {
      appendField(this.summary, 'gpu memory', formatSummary(summary), 96);
    }
  }
}

/** Builds the DOM of one viewport section. */
function createSection(entry: RenderModePanelEntry): HTMLDivElement {
  const bindings = orderBindings(entry.bindings);
  const volumes = entry.volumes ?? [];
  const section = document.createElement('div');
  section.style.cssText = `
    padding:7px;
    background:rgba(0, 0, 0, 0.18);
    border:1px solid rgba(255, 204, 0, 0.18);
    border-radius:4px;
  `;

  const viewportId = `${entry.renderingEngineId}/${entry.viewportId}`;
  const heading = document.createElement('div');
  heading.title = viewportId;
  heading.style.cssText = `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:6px;
    color:#ffd84d;
    font-weight:700;
  `;

  const left = document.createElement('div');
  left.style.cssText = `
    display:flex;
    align-items:center;
    gap:6px;
    min-width:0;
  `;

  const name = document.createElement('span');
  name.textContent = truncate(viewportId, 72);
  name.style.cssText = `
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  `;
  left.appendChild(name);

  if (entry.viewportType) {
    const type = document.createElement('span');
    type.textContent = entry.viewportType;
    type.title = entry.viewportType;
    type.style.cssText = `
      flex:0 0 auto;
      padding:2px 6px;
      background:rgba(255, 204, 0, 0.14);
      border:1px solid rgba(255, 204, 0, 0.4);
      border-radius:3px;
      color:#ffe08a;
      font-size:${PANEL_CONFIG.FONT_SIZE}px;
      font-weight:700;
      letter-spacing:0.03em;
    `;
    left.appendChild(type);
  }

  heading.appendChild(left);

  const count = document.createElement('span');
  count.textContent = `${bindings.length} binding${
    bindings.length === 1 ? '' : 's'
  } · ${volumes.length} vol${volumes.length === 1 ? '' : 's'}`;
  count.style.cssText = `
    flex:0 0 auto;
    color:#c9b05a;
    font-size:${PANEL_CONFIG.FONT_SIZE}px;
    font-weight:600;
  `;
  heading.appendChild(count);

  section.appendChild(heading);

  if (!bindings.length && !volumes.length) {
    section.appendChild(createEmptyState('(no bindings)'));

    return section;
  }

  for (const binding of bindings) {
    section.appendChild(createBindingRow(binding));
  }

  for (const volume of volumes) {
    section.appendChild(createVoxelQualityRow(volume));
  }

  return section;
}

export type RenderModePanelVolumeQuality = {
  volumeId: string;
  record?: VoxelQualityRecord;
};

export type RenderModePanelEntry = {
  renderingEngineId: string;
  viewportId: string;
  viewportType: string;
  bindings: RenderModePanelBinding[];
  volumes?: RenderModePanelVolumeQuality[];
};

export type RenderModePanelBinding = {
  actorUID?: string;
  dataId: string;
  referencedId?: string;
  renderMode: string;
  role: 'source' | 'overlay' | 'data';
  /** Scalar buffer type backing the actor, e.g. `Uint8Array`. */
  scalarType?: string;
  /** Min/max of the actor's scalar data. */
  scalarRange?: [number, number];
  /** Number of components per voxel (1 for grayscale, 3 for RGB, ...). */
  numberOfComponents?: number;
  /** Width and height of the sampled slice that is drawn. */
  sliceSize?: [number, number];
  /** Milliseconds of the last voxel-size sample of the slice. */
  sampleMs?: number;
  /** Milliseconds of the last sample of the slice on the screen grid. */
  fineSampleMs?: number;
  /** The counts of the cache of sampled slices of the binding. */
  sliceCache?: {
    size: number;
    hits: number;
    misses: number;
    prefetched: number;
  };
  /** What the binding holds on the GPU to draw. */
  gpuTextures?: RenderModePanelTexture[];
};

/**
 * One texture that a binding draws from. `slice` is the 2D texture of an
 * image mapper, `volume` the 3D textures of a volume (shared by every
 * viewport that draws that volume), and `canvas` says that the binding is
 * drawn on a 2D canvas and holds no texture.
 */
export type RenderModePanelTexture = {
  kind: 'slice' | 'volume' | 'canvas';
  bytes: number;
  /** Width and height of a 2D texture. */
  dimensions?: [number, number];
  /** Array type of the uploaded values of a 2D texture. */
  scalarType?: string;
  /** True when the GPU can hold the values in another format than the array. */
  approximate?: boolean;
  volumeId?: string;
  /** The number of viewports that draw the same volume. */
  sharedBy?: number;
};

/** The GPU texture memory of every viewport, each texture counted once. */
export type RenderModePanelSummary = {
  volumeTextureBytes: number;
  sliceTextureBytes: number;
  sliceTexturesApproximate?: boolean;
};

function orderBindings(
  bindings: RenderModePanelBinding[]
): RenderModePanelBinding[] {
  const rank = {
    source: 0,
    overlay: 1,
    data: 2,
  };

  return [...bindings].sort((a, b) => {
    const roleDelta = rank[a.role] - rank[b.role];

    if (roleDelta !== 0) {
      return roleDelta;
    }

    return a.dataId.localeCompare(b.dataId);
  });
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

const ROLE_STYLES: Record<
  RenderModePanelBinding['role'],
  { background: string; border: string; color: string; label: string }
> = {
  source: {
    background: 'rgba(0, 104, 126, 0.34)',
    border: 'rgba(92, 225, 255, 0.4)',
    color: '#9decff',
    label: 'SOURCE',
  },
  overlay: {
    background: 'rgba(165, 102, 0, 0.3)',
    border: 'rgba(255, 205, 83, 0.45)',
    color: '#ffd76d',
    label: 'OVERLAY',
  },
  data: {
    background: 'rgba(96, 101, 116, 0.28)',
    border: 'rgba(187, 195, 214, 0.32)',
    color: '#dce5ff',
    label: 'DATA',
  },
};

function createBindingRow(binding: RenderModePanelBinding): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display:grid;
    grid-template-columns:74px minmax(0, 1fr);
    gap:8px;
    padding:6px;
    margin-top:4px;
    background:rgba(255, 255, 255, 0.045);
    border-radius:4px;
  `;

  const roleStyle = ROLE_STYLES[binding.role];
  const role = document.createElement('div');
  role.textContent = roleStyle.label;
  role.style.cssText = `
    align-self:start;
    padding:3px 5px;
    background:${roleStyle.background};
    border:1px solid ${roleStyle.border};
    border-radius:3px;
    color:${roleStyle.color};
    font-size:${PANEL_CONFIG.FONT_SIZE}px;
    font-weight:800;
    letter-spacing:0.04em;
    text-align:center;
  `;
  row.appendChild(role);

  const fields = document.createElement('div');
  fields.style.cssText = `
    display:flex;
    flex-direction:column;
    gap:3px;
    min-width:0;
  `;

  appendField(fields, 'mode', binding.renderMode, 48);
  appendField(fields, 'data', binding.dataId, 76);

  if (binding.actorUID && binding.actorUID !== binding.dataId) {
    appendField(fields, 'actor', binding.actorUID, 76);
  }

  if (
    binding.referencedId &&
    binding.referencedId !== binding.dataId &&
    binding.referencedId !== binding.actorUID
  ) {
    appendField(fields, 'reference', binding.referencedId, 76);
  }

  if (binding.scalarType) {
    appendField(
      fields,
      'type',
      formatScalarType(binding.scalarType, binding.numberOfComponents),
      40
    );
  }

  if (binding.scalarRange) {
    appendField(fields, 'range', formatScalarRange(binding.scalarRange), 56);
  }

  appendSamplingFields(fields, binding);

  for (const texture of binding.gpuTextures ?? []) {
    appendField(fields, 'gpu', formatTexture(texture), 64);
  }

  row.appendChild(fields);

  return row;
}

function createVoxelQualityRow(
  volume: RenderModePanelVolumeQuality
): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display:grid;
    grid-template-columns:74px minmax(0, 1fr);
    gap:8px;
    padding:6px;
    margin-top:4px;
    background:rgba(153, 204, 255, 0.06);
    border:1px solid rgba(153, 204, 255, 0.18);
    border-radius:4px;
  `;

  const badge = document.createElement('div');
  badge.textContent = 'QUALITY';
  badge.style.cssText = `
    align-self:start;
    padding:3px 5px;
    background:rgba(0, 104, 126, 0.28);
    border:1px solid rgba(153, 204, 255, 0.4);
    border-radius:3px;
    color:#9cf;
    font-size:${PANEL_CONFIG.FONT_SIZE}px;
    font-weight:800;
    letter-spacing:0.04em;
    text-align:center;
  `;
  row.appendChild(badge);

  const fields = document.createElement('div');
  fields.style.cssText = `
    display:flex;
    flex-direction:column;
    gap:3px;
    min-width:0;
  `;

  const { record } = volume;
  if (!record) {
    fields.appendChild(createEmptyState('(no VoxelQualityRecord)'));
    row.appendChild(fields);
    return row;
  }

  appendField(fields, 'reduction', String(record.reduction), 40);
  appendField(fields, 'source', String(record.source), 40);
  appendField(
    fields,
    'status',
    formatQualityRange(record.status, record.lowest, record.highest),
    64
  );
  appendField(
    fields,
    'missing',
    formatMissing(record.missing, record.voxels, record.exact),
    48
  );
  appendField(fields, 'grid', formatSpacing(record.grid?.spacing), 48);
  appendField(fields, 'deliveries', String(record.deliveries ?? 0), 24);

  row.appendChild(fields);

  return row;
}

function formatQualityRange(
  status: ImageQualityStatus,
  lowest?: ImageQualityStatus,
  highest?: ImageQualityStatus
): string {
  const summary = formatQualityStatus(status);

  if (
    lowest === undefined ||
    highest === undefined ||
    (lowest === status && highest === status)
  ) {
    return summary;
  }

  return `${summary} [${formatQualityStatus(lowest)}..${formatQualityStatus(
    highest
  )}]`;
}

function formatQualityStatus(status: ImageQualityStatus | undefined): string {
  if (status === undefined) {
    return '-';
  }

  return ImageQualityStatus[status] ?? String(status);
}

function formatMissing(
  missing: number,
  voxels: number,
  exact: boolean
): string {
  if (!(voxels > 0)) {
    return '0/0';
  }

  const pct = Math.round((100 * missing) / voxels);
  const approx = exact ? '' : '~';

  return `${approx}${missing}/${voxels} (${approx}${pct}%)`;
}

function formatSpacing(spacing: number[] | undefined): string {
  if (!spacing?.length) {
    return '-';
  }

  return spacing
    .map((value) => {
      if (!Number.isFinite(value)) {
        return '?';
      }

      if (Number.isInteger(value)) {
        return String(value);
      }

      return Number(value.toFixed(3)).toString();
    })
    .join('×');
}

/**
 * Renders the scalar buffer type compactly, dropping the `Array` suffix and
 * appending the component count for multi-component data, e.g. `Uint8Array`
 * with 3 components becomes `Uint8 x3`.
 */
function formatScalarType(
  scalarType: string,
  numberOfComponents?: number
): string {
  const friendly = scalarType.replace(/Array$/, '');

  return numberOfComponents && numberOfComponents > 1
    ? `${friendly} x${numberOfComponents}`
    : friendly;
}

function formatScalarRange([min, max]: [number, number]): string {
  return `${formatScalarValue(min)} .. ${formatScalarValue(max)}`;
}

function formatScalarValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(2)).toString();
}

/** Adds the slice size, the sample times and the slice cache counts. */
function appendSamplingFields(
  fields: HTMLDivElement,
  binding: RenderModePanelBinding
): void {
  if (binding.sliceSize) {
    appendField(
      fields,
      'slice',
      `${binding.sliceSize[0]} x ${binding.sliceSize[1]}`,
      40
    );
  }

  if (binding.sampleMs !== undefined || binding.fineSampleMs !== undefined) {
    appendField(
      fields,
      'sample',
      `${formatMs(binding.sampleMs)}, fine ${formatMs(binding.fineSampleMs)}`,
      48
    );
  }

  if (binding.sliceCache) {
    const { size, hits, misses, prefetched } = binding.sliceCache;

    appendField(
      fields,
      'slice cache',
      `${size} held, ${hits} hits, ${misses} misses, ${prefetched} prefetched`,
      64
    );
  }
}

function formatMs(value: number | undefined): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '-';
}

/** Formats bytes as MB with one decimal, as the MB panel counts them. */
export function formatMegabytes(bytes: number, approximate = false): string {
  const megabytes = (bytes / CONVERSION.BYTES_TO_MB).toFixed(
    bytes > 0 && bytes < CONVERSION.BYTES_TO_MB ? 2 : 1
  );

  return `${approximate ? 'about ' : ''}${megabytes} MB`;
}

function formatTexture(texture: RenderModePanelTexture): string {
  if (texture.kind === 'canvas') {
    return 'none, drawn on a 2D canvas';
  }

  if (texture.kind === 'slice') {
    const [width, height] = texture.dimensions ?? [0, 0];
    const type = texture.scalarType
      ? ` ${texture.scalarType.replace(/Array$/, '')}`
      : '';

    return `2D slice ${width}x${height}${type}, ${formatMegabytes(
      texture.bytes,
      texture.approximate
    )}`;
  }

  const shared =
    texture.sharedBy && texture.sharedBy > 1
      ? `, shared by ${texture.sharedBy} viewports`
      : '';

  return `3D volume ${formatMegabytes(texture.bytes)}${shared}`;
}

function formatSummary(summary: RenderModePanelSummary): string {
  return `3D volumes ${formatMegabytes(
    summary.volumeTextureBytes
  )}, 2D slices ${formatMegabytes(
    summary.sliceTextureBytes,
    summary.sliceTexturesApproximate
  )}`;
}

/**
 * A string that changes when anything the section of an entry shows
 * changes. A section whose signature is the same keeps its DOM.
 */
function getEntrySignature(entry: RenderModePanelEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return String(Math.random());
  }
}

function appendField(
  parent: HTMLDivElement,
  label: string,
  value: string,
  maxLength: number
): void {
  const field = document.createElement('div');
  field.style.cssText = `
    display:grid;
    grid-template-columns:88px minmax(0, 1fr);
    gap:6px;
    min-width:0;
  `;

  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  labelNode.style.cssText = `
    color:#a9954c;
    font-size:${PANEL_CONFIG.FONT_SIZE}px;
    font-weight:700;
    text-transform:uppercase;
  `;
  field.appendChild(labelNode);

  const valueNode = document.createElement('span');
  valueNode.textContent = truncate(value, maxLength);
  valueNode.title = value;
  valueNode.style.cssText = `
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:#fff7d6;
  `;
  field.appendChild(valueNode);

  parent.appendChild(field);
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement('div');
  empty.textContent = message;
  empty.style.cssText = `
    color:#b7a865;
    font-style:italic;
  `;

  return empty;
}
