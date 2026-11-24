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
  const { dataId } = viewport.getViewReference();
  const saved: Types.ViewReference = {
    FrameOfReferenceUID: current.FrameOfReferenceUID,
    dataId: current.dataId,
  };

  viewport.setViewReference({ ...saved, dataId: 'pt' });

  return [
    viewport.getViewReference().dataId,
    viewport.isReferenceViewable({ dataId, referencedImageId: 'image:1' }),
  ];
}

export function renderPlan(engine: RenderingEngine) {
  const viewport = engine.getViewport<PlanarViewport>('CT');
  const plan = viewport.getRenderPlan();
  const ids = plan.map((layer) => layer.dataId);
  const source = viewport.getRenderPlan().find(({ dataId }) => dataId === 'ct');

  for (const layer of plan.filter((entry) => entry.draw === 'cpu')) {
    ids.push(layer.dataId);
  }

  viewport.removeData(viewport.getRenderPlan()[1].dataId);

  return [ids, source?.dataId, viewport.getSourceDataId()];
}

export function listen(element: HTMLDivElement) {
  element.addEventListener(Events.RENDER_PLAN_CHANGED, ((evt: CustomEvent) => {
    console.log(evt.detail.dataId, evt.detail.reason);
  }) as EventListener);
  eventTarget.addEventListener(Enums.Events.RENDER_PATH_ERROR, onError);
  element.addEventListener(Events.IMAGE_RENDERED, ((evt: CustomEvent) => {
    console.log(evt.detail.rendering?.dataId);
  }) as EventListener);
}

function onError(evt: CustomEvent) {
  const { detail } = evt;
  const { dataId, error } = detail;

  console.warn(dataId, detail.dataId, error);
}

export function overlays(engine: RenderingEngine, imageId: string) {
  const video = engine.getViewport<VideoViewport>('video');
  const labelmap = { imageId, dataId: 'labelmap' };

  video.addImages([labelmap, { imageId, dataId: 'second' }]);

  return viewportProjection.get(video, { dataId: 'video' })?.dataId;
}

export function own(specs: Array<{ dataId: string }>) {
  const spec = specs[0];
  const viewport = getViewportSomehow();

  record({ dataId: spec.dataId });

  return [viewport.getSourceDataId(), viewport.getActiveDataId()];
}

declare function record(value: object): void;
declare function getViewportSomehow(): { getSourceDataId(): string; getActiveDataId(): string };
