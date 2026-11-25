export function Viewer({ viewport, imageIds }) {
  utilities.genericViewportDisplaySetMetadataProvider.add('ct', { imageIds });
  const snapshot = viewportProjection.withPresentation(viewport, {});

  return <div data-snapshot={snapshot} />;
}
