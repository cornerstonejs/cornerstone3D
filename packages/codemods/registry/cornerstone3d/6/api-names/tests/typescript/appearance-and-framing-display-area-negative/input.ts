import { Enums } from '@cornerstonejs/core';
import { DisplayAreaService, ViewportInfo } from './services';

export function frame(viewportInfo: ViewportInfo, service: DisplayAreaService) {
  const area = viewportInfo.getDisplayArea();

  service.setDisplayArea(area);
  service.setOptions({ displayArea: area });
  service.reset();

  const form = { options: { displayArea: area } };
  const events = { DISPLAY_AREA_MODIFIED: 'app:area' };
  const selector = { windowLevel: true, paletteLut: true, slabThickness: 1 };

  return [form.options, events.DISPLAY_AREA_MODIFIED, selector, Enums.Events];
}
