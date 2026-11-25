import { getRenderingEngine } from '@cornerstonejs/core';
import { LayoutService } from './services';

export function layout(service: LayoutService, element: HTMLDivElement) {
  const viewport = getRenderingEngine('engine').getViewport('a');
  const options = { aspectRatio: [16, 9] };
  const style = { aspectRatio: '1 / 1' };

  service.setViewFraming({ aspectRatio: [2, 1] });
  service.getViewFraming({ aspectRatio: true });
  viewport.setViewState({ scale: [2, 1] });
  element.style.aspectRatio = '2 / 1';

  return [options, style, viewport.getAspectRatio()];
}
