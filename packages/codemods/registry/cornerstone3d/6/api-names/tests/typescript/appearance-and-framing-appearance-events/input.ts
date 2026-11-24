import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine, eventTarget } from '@cornerstonejs/core';

const { Events } = Enums;
const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

function showWindow(text: string) {
  document.title = text;
}

export function listen(element: HTMLDivElement) {
  element.addEventListener(
    Enums.Events.VOI_MODIFIED,
    (evt: Types.EventTypes.VoiModifiedEvent) => {
      const { lower, upper } = evt.detail.range;

      showWindow(`${lower} ${upper} ${evt.detail.viewportId}`);
    }
  );

  const onColormap = (event: Types.EventTypes.ColormapModifiedEvent) => {
    const { colormap, volumeId } = event.detail;

    showWindow(`${volumeId}: ${colormap.name}`);
  };

  element.addEventListener(Events.COLORMAP_MODIFIED, onColormap);
  eventTarget.addEventListener(Events.VOI_MODIFIED, function (evt) {
    const { range: window, invert } = evt.detail;

    showWindow(`${window.lower} ${invert}`);
  });
}

export function readout(displaySetId: string) {
  const appearance = viewport.getDisplaySetAppearance(displaySetId);

  return appearance?.invert === true ? 'inverted' : 'not inverted';
}

export function copy(target: PlanarViewport, displaySetId: string) {
  target.setDisplaySetAppearance(
    displaySetId,
    viewport.getDisplaySetAppearance(displaySetId)
  );
}

export type Detail = Types.EventTypes.VoiModifiedEventDetail;
