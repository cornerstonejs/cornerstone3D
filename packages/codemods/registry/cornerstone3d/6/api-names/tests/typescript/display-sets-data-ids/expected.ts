import {
  Enums,
  RenderingEngine,
  eventTarget,
  viewportProjection,
} from '@cornerstonejs/core';
import type { PlanarViewport, Types, VideoViewport } from '@cornerstonejs/core';

const { Events } = Enums;

export function references(engine: RenderingEngine) {
  const viewport = engine.getViewport<PlanarViewport>('CT');
  const current = viewport.getViewReference();
  const { displaySetId: dataId } = viewport.getViewReference();
  const saved: Types.ViewReference = {
    FrameOfReferenceUID: current.FrameOfReferenceUID,
    displaySetId: current.displaySetId,
  };

  viewport.setViewReference({ ...saved, displaySetId: 'pt' });

  return [
    viewport.getViewReference().displaySetId,
    viewport.isReferenceViewable({ displaySetId: dataId, referencedImageId: 'image:1' }),
  ];
}

export function renderPlan(engine: RenderingEngine) {
  const viewport = engine.getViewport<PlanarViewport>('CT');
  const plan = viewport.getRenderPlan();
  const ids = plan.map((layer) => layer.displaySetId);
  const source = viewport.getRenderPlan().find(({ displaySetId: dataId }) => dataId === 'ct');

  for (const layer of plan.filter((entry) => entry.draw === 'cpu')) {
    ids.push(layer.displaySetId);
  }

  viewport.removeDisplaySet(viewport.getRenderPlan()[1].displaySetId);

  return [ids, source?.displaySetId, viewport.getSourceDisplaySetId()];
}

export function listen(element: HTMLDivElement) {
  element.addEventListener(Events.RENDER_PLAN_CHANGED, ((evt: CustomEvent) => {
    console.log(evt.detail.displaySetId, evt.detail.reason);
  }) as EventListener);
  eventTarget.addEventListener(Enums.Events.RENDER_PATH_ERROR, onError);
  element.addEventListener(Events.IMAGE_RENDERED, ((evt: CustomEvent) => {
    console.log(evt.detail.rendering?.displaySetId);
  }) as EventListener);
}

function onError(evt: CustomEvent) {
  const { detail } = evt;
  const { displaySetId: dataId, error } = detail;

  console.warn(dataId, detail.displaySetId, error);
}

export function overlays(engine: RenderingEngine, imageId: string) {
  const video = engine.getViewport<VideoViewport>('video');
  const labelmap = { imageId, displaySetId: 'labelmap' };

  video.addImages([labelmap, { imageId, displaySetId: 'second' }]);

  return viewportProjection.get(video, { displaySetId: 'video' })?.displaySetId;
}

export function own(specs: Array<{ dataId: string }>) {
  const spec = specs[0];
  const viewport = getViewportSomehow();

  record({ dataId: spec.dataId });

  return [viewport.getSourceDataId(), viewport.getActiveDataId()];
}

declare function record(value: object): void;
declare function getViewportSomehow(): { getSourceDataId(): string; getActiveDataId(): string };
