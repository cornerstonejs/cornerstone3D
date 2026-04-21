import type { Panel } from './types';
import { PANEL_CONFIG, PANEL_CONFIGS } from './constants';
import { PanelType } from './enums';

/**
 * Text panel that displays each viewport's active render modes from its
 * internal `_debug.renderModes` map.
 */
export class RenderModesPanel implements Panel {
  public dom: HTMLDivElement;
  private readonly list: HTMLDivElement;

  constructor() {
    const config = PANEL_CONFIGS[PanelType.RENDER_MODES];
    this.dom = document.createElement('div');
    this.dom.style.cssText = `
      width:${PANEL_CONFIG.WIDE_WIDTH}px;
      min-height:${PANEL_CONFIG.HEIGHT}px;
      background:${config.backgroundColor};
      color:${config.foregroundColor};
      font:bold ${PANEL_CONFIG.FONT_SIZE}px ${PANEL_CONFIG.FONT_FAMILY};
      padding:${PANEL_CONFIG.TEXT_PADDING}px;
      box-sizing:border-box;
      overflow:hidden;
    `;

    const title = document.createElement('div');
    title.textContent = config.name;
    title.style.marginBottom = '4px';
    this.dom.appendChild(title);

    this.list = document.createElement('div');
    this.list.style.cssText = `
      white-space:pre;
      line-height:1.3;
      font-weight:normal;
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
      renderModes: Record<string, string>;
    }>
  ): void {
    if (!entries.length) {
      this.list.textContent = '(no viewports)';
      return;
    }

    const lines: string[] = [];

    for (const entry of entries) {
      lines.push(`${entry.renderingEngineId}/${entry.viewportId}`);
      const pairs = Object.entries(entry.renderModes);

      if (!pairs.length) {
        lines.push('  (no render modes)');
        continue;
      }

      for (const [dataId, mode] of pairs) {
        lines.push(`  ${truncate(dataId, 48)} -> ${mode}`);
      }
    }

    this.list.textContent = lines.join('\n');
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
