export function Volume({ renderingEngine, viewportId, imageIds, volumeId }) {
  const displaySetId = 'ctVolume';

  async function show() {
    utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, { imageIds, volumeId });
    await renderingEngine.getViewport(viewportId).setDisplaySets({ displaySetId });
  }

  return <button onClick={show}>Show {displaySetId}</button>;
}
