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

  viewport.setViewState({ displayArea: { imageArea: [0.5, 0.5], storeAsInitialCamera: true } });
  viewport.setViewState({ displayArea: area });
  viewport.setViewState({ displayArea });
  const shown = viewport.getViewState().displayArea;
  const kept = viewport.getViewState().displayArea?.imageArea;

  viewport.setOptions({ displayArea: area }, true);
  viewport.reset(true);
  const options = viewport.options;

  viewport.setViewState({ displayArea: area });

  const zoom = viewport.getViewFraming({
    zoom: true,
  });
  const framing = viewportProjection.getFraming(viewport, {
    selector: { pan: true },
  });
  const pick: Types.ViewFramingSelector = { rotation: true };

  viewport.setViewFraming({ zoom: 2 });
  viewport.element.addEventListener(Events.DISPLAY_AREA_MODIFIED, onArea);
  eventTarget.addEventListener(Enums.Events.DISPLAY_AREA_MODIFIED, onArea);

  return [shown, kept, options, zoom, framing, pick];
}

function onArea(event: Types.EventTypes.DisplayAreaModifiedEvent) {
  const detail: Types.EventTypes.DisplayAreaModifiedEventDetail = event.detail;

  return detail.displayArea;
}
