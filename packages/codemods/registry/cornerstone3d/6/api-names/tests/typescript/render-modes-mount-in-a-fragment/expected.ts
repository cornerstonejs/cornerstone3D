await viewport.addDisplaySet(meshId1);
await viewport.setDisplaySets({
  displaySetId: volumeId,
  options: { role: 'source' },
});
await other.addDisplaySet(meshId2, { renderMode: 'auto' });
