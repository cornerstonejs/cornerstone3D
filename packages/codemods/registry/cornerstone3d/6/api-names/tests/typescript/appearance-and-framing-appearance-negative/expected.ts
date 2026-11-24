import { RenderingEngine, type Types } from '@cornerstonejs/core';
import { usePositionPresentationStore } from '@ohif/extension-cornerstone';

type PositionPresentation = { viewReference: Types.ViewReference; zoom: number };
type LutPresentation = { properties: Record<string, object> };
type SegmentationPresentation = Array<{ segmentationId: string }>;

interface PresentationStore {
  presentationIds: Record<string, string>;
  getPresentations(viewportId: string): PositionPresentation[];
  setPresentations(viewportId: string, value: LutPresentation): void;
}

const renderingEngine = new RenderingEngine('engine');

export function remember(
  store: PresentationStore,
  segmentationService: { getPresentation(viewportId: string): SegmentationPresentation },
  adapter: { getPresentation(displaySetId?: string): object; setPresentation(id: string, props: object): void },
  displaySetId: string
) {
  const { positionPresentationStore } = usePositionPresentationStore.getState();
  const presentation = { presentation: { invert: true }, displaySetId };
  const hangingProtocol = { displaySets: [{ id: displaySetId, options: { presentation: 'LUT' } }] };

  adapter.setPresentation(displaySetId, adapter.getPresentation(displaySetId));
  store.setPresentations('vp', { properties: presentation });

  return [
    store.getPresentations('vp'),
    store.presentationIds,
    segmentationService.getPresentation('vp'),
    positionPresentationStore,
    hangingProtocol,
    renderingEngine.id,
  ];
}
