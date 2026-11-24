import { viewportProjection, type Types } from '@cornerstonejs/core';

interface ViewPresentation {
  zoom: number;
  label: string;
}

type PositionPresentation = {
  viewReference: Types.ViewReference;
  viewPresentation: ViewPresentation;
};

const presentationIds = new Map<string, string>();

export function store(
  viewport: Types.IViewport,
  service: { getPresentation(id: string): ViewPresentation; withPresentation(id: string): void },
  slide: { presentation: { title: string } },
  usePositionPresentationStore: () => { setPresentations(id: string, value: PositionPresentation): void }
) {
  const snapshot = viewportProjection.get(viewport);
  const own: ViewPresentation = service.getPresentation('vp');
  const position: PositionPresentation = {
    viewReference: viewport.getViewReference(),
    viewPresentation: own,
  };

  service.withPresentation('vp');
  usePositionPresentationStore().setPresentations('vp', position);
  presentationIds.set('vp', slide.presentation.title);

  return [snapshot, position];
}
