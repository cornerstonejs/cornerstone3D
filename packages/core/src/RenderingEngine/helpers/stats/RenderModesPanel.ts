import type { Panel } from './types';
import { PANEL_CONFIG, PANEL_CONFIGS } from './constants';
import { PanelType } from './enums';

/**
 * Text panel that displays each viewport's ViewportNext bindings from its
 * internal debug map plus public actor metadata.
 */
export class RenderModesPanel implements Panel {
  public dom: HTMLDivElement;
  private readonly list: HTMLDivElement;

  constructor() {
    const config = PANEL_CONFIGS[PanelType.RENDER_MODES];
    this.dom = document.createElement('div');
    this.dom.style.cssText = `
      width:min(720px, max(${PANEL_CONFIG.WIDE_WIDTH}px, calc(100vw - ${
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

  public setContent(
    entries: Array<{
      renderingEngineId: string;
      viewportId: string;
      bindings: RenderModePanelBinding[];
    }>
  ): void {
    this.list.replaceChildren();

    if (!entries.length) {
      this.list.appendChild(createEmptyState('(no viewports)'));
      return;
    }

    for (const entry of entries) {
      const bindings = orderBindings(entry.bindings);
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
        justify-content:space-between;
        gap:8px;
        margin-bottom:6px;
        color:#ffd84d;
        font-weight:700;
      `;

      const name = document.createElement('span');
      name.textContent = truncate(viewportId, 72);
      name.style.cssText = `
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      `;
      heading.appendChild(name);

      const count = document.createElement('span');
      count.textContent = `${bindings.length} binding${bindings.length === 1 ? '' : 's'}`;
      count.style.cssText = `
        flex:0 0 auto;
        color:#c9b05a;
        font-size:${PANEL_CONFIG.FONT_SIZE}px;
        font-weight:600;
      `;
      heading.appendChild(count);

      section.appendChild(heading);

      if (!bindings.length) {
        section.appendChild(createEmptyState('(no bindings)'));
        this.list.appendChild(section);
        continue;
      }

      for (const binding of bindings) {
        section.appendChild(createBindingRow(binding));
      }

      this.list.appendChild(section);
    }
  }
}

export type RenderModePanelBinding = {
  actorUID?: string;
  dataId: string;
  referencedId?: string;
  renderMode: string;
  role: 'source' | 'overlay' | 'data';
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
    appendField(fields, 'ref', binding.referencedId, 76);
  }

  row.appendChild(fields);

  return row;
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
    grid-template-columns:42px minmax(0, 1fr);
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
