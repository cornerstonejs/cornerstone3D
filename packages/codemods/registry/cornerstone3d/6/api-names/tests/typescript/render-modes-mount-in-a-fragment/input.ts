await viewport.addDisplaySet(meshId1, { renderMode: 'vtkGeometry3d' });
await viewport.setDisplaySets({
  displaySetId: volumeId,
  options: { renderMode: 'vtkVolume3d', role: 'source' },
});
await other.addDisplaySet(meshId2, { renderMode: 'auto' });
