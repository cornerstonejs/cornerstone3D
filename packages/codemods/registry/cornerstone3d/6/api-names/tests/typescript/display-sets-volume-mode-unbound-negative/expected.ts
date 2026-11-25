const displaySetId = 'ctVolume';

displaySetRegistry.add(displaySetId, { imageIds, volumeId });

await Promise.all(
  [viewportId1, viewportId2].map((viewportId) =>
    renderingEngine.getViewport(viewportId).setDisplaySets({ displaySetId })
  )
);
await renderingEngine
  .getViewport(viewportId)
  .setDisplaySets({ displaySetId, options: { mode: 'volume' } });
await renderingEngine
  .getViewport(viewportId)
  .setDisplaySets({ displaySetId, options: { mode: 'stack' } });

displaySetRegistry.add('elsewhere', { imageIds, volumeId });

utilities.genericViewportDisplaySetMetadataProvider.add('beta-stack', { kind: 'planar', imageIds });
viewport.setDisplaySets({ displaySetId: 'beta-stack' });

utilities.genericViewportDisplaySetMetadataProvider.add('pmap', { volumeId: 'pmap-volume' });
viewport.setDisplaySets({ displaySetId: 'pmap' });

export function local(registry: Map<string, object>) {
  const utilities = {
    genericViewportDisplaySetMetadataProvider: {
      add: (id: string, value: object) => registry.set(id, value),
    },
  };

  utilities.genericViewportDisplaySetMetadataProvider.add('mine', { imageIds, volumeId });
  viewport.setDisplaySets({ displaySetId: 'mine' });
}

otherRegistry.add('other', { imageIds, volumeId });
viewport.setDisplaySets({ displaySetId: 'other' });
