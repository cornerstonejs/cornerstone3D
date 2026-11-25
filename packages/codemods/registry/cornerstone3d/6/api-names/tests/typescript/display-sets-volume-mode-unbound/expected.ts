const displaySetId = 'ctVolume';

utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  volumeId,
});

await Promise.all(
  [viewportId1, viewportId2].map((viewportId) =>
    renderingEngine.getViewport(viewportId).setDisplaySets({ displaySetId })
  )
);

await Promise.all(
  [viewportId1, viewportId2].map(async (viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    await viewport.setDisplaySets({ displaySetId });
    await viewport.addDisplaySet(displaySetId, { initialImageIdIndex: 3 });
  })
);

utilities.genericViewportDisplaySetMetadataProvider.add(ptDisplaySetId, { imageIds: ptImageIds, volumeId: ptVolumeId });
viewport.setDisplaySets({ displaySetId: ptDisplaySetId, options: { role: 'overlay' } });

utilities.genericViewportDisplaySetMetadataProvider.add('mpr', { ...descriptor, volumeId: 'mpr-volume' });

utilities.genericViewportDisplaySetMetadataProvider.add('mpr3d', { imageIds, volumeId });
await renderingEngine
  .getViewport('3D')
  .setDisplaySets({ displaySetId: 'mpr3d' });
await renderingEngine
  .getViewport('AXIAL')
  .setDisplaySets({ displaySetId: 'mpr3d', options: { mode: 'volume' } });
