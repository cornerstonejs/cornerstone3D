utilities.genericViewportDisplaySetMetadataProvider.add('ct', { imageIds });

const framing = viewportProjection.getPresentation(viewport, {
  selector: { pan: true },
});

viewport.element.addEventListener(Enums.Events.VOI_MODIFIED, () => framing);

export function local() {
  const utilities = { genericViewportDisplaySetMetadataProvider: { add() {} } };
  const Enums = { Events: { VOI_MODIFIED: 'voi' } };

  utilities.genericViewportDisplaySetMetadataProvider.add();

  return Enums.Events.VOI_MODIFIED;
}
