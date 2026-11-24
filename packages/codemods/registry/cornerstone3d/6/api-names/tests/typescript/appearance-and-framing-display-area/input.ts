import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  Enums,
  eventTarget,
  getRenderingEngine,
  viewportProjection,
} from '@cornerstonejs/core';

const { Events } = Enums;

export function frame(
  renderingEngineId: string,
  viewportId: string,
  area: Types.DisplayArea,
  displayArea: Types.DisplayArea
) {
  const viewport =
    getRenderingEngine(renderingEngineId).getViewport<PlanarViewport>(
      viewportId
    );

  viewport.setDisplayArea({ imageArea: [0.5, 0.5], storeAsInitialCamera: true });
  viewport.setDisplayArea(area);
  viewport.setDisplayArea(displayArea);
  const shown = viewport.getDisplayArea();
  const kept = viewport.getDisplayArea()?.imageArea;

  viewport.setOptions({ displayArea: area }, true);
  viewport.reset(true);
  const options = viewport.options;

  viewport.setViewState({ displayArea: area });

  const zoom = viewport.getViewFraming({
    zoom: true,
    windowLevel: true,
    paletteLut: true,
  });
  const framing = viewportProjection.getFraming(viewport, {
    selector: { pan: true, slabThickness: 1 },
  });
  const pick: Types.ViewFramingSelector = { rotation: true, windowLevel: true };

  viewport.setViewFraming({ zoom: 2, slabThickness: 3 });
  viewport.element.addEventListener(Events.DISPLAY_AREA_MODIFIED, onArea);
  eventTarget.addEventListener(Enums.Events.DISPLAY_AREA_MODIFIED, onArea);

  return [shown, kept, options, zoom, framing, pick];
}

function onArea(event: Types.EventTypes.DisplayAreaModifiedEvent) {
  const detail: Types.EventTypes.DisplayAreaModifiedEventDetail = event.detail;

  return detail.displayArea;
}
