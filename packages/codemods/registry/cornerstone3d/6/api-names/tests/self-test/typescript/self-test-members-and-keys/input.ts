import { RenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export async function run(viewport, imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const planar = renderingEngine.getViewport('CT');

  planar.getSampleOld();
  planar?.getSampleOld?.();
  planar['getSampleOld']();
  const has = 'getSampleOld' in planar;
  const { getSampleOld } = planar;
  viewport.getSampleOld();
  const removed = planar.sampleRemovedMember;
  renderingEngine.sampleEngineOld();

  const reference = planar.getViewReference();
  const typedReference: Types.ViewReference = reference;
  const ids = [
    reference.sampleOldId,
    planar.getViewReference().sampleOldId,
    typedReference.sampleOldId,
  ];

  await planar.setDisplaySets({ sampleOldId: 'a' });
  await planar.setDisplaySets([{ sampleOldId: 'a' }, { 'sampleOldId': imageIds[0] }]);
  const sampleOldId = 'c';
  const entries = [{ sampleOldId }];
  await planar.setDisplaySets(entries);
  await planar.setDisplaySets({ sampleRemovedKey: true });

  const input: Types.PublicViewportInput = {
    viewportId: 'CT',
    defaultOptions: { sampleOldOption: 1 },
  };

  return [has, getSampleOld, removed, ids, input];
}
