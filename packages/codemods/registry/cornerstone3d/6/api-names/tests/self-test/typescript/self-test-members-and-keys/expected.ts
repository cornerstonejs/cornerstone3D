import { RenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export async function run(viewport, imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const planar = renderingEngine.getViewport('CT');

  planar.getSampleNew();
  planar?.getSampleNew?.();
  planar['getSampleNew']();
  const has = 'getSampleNew' in planar;
  const { getSampleNew: getSampleOld } = planar;
  viewport.getSampleOld();
  const removed = planar.sampleRemovedMember;
  renderingEngine.sampleEngineNew();

  const reference = planar.getViewReference();
  const typedReference: Types.ViewReference = reference;
  const ids = [
    reference.sampleNewId,
    planar.getViewReference().sampleNewId,
    typedReference.sampleNewId,
  ];

  await planar.setDisplaySets({ sampleNewId: 'a' });
  await planar.setDisplaySets([{ sampleNewId: 'a' }, { 'sampleNewId': imageIds[0] }]);
  const sampleOldId = 'c';
  const entries = [{ sampleNewId: sampleOldId }];
  await planar.setDisplaySets(entries);
  await planar.setDisplaySets({ sampleRemovedKey: true });

  const input: Types.PublicViewportInput = {
    viewportId: 'CT',
    defaultOptions: { sampleNewOption: 1 },
  };

  return [has, getSampleOld, removed, ids, input];
}
