export default function filterViewportsWithFrameOfReferenceUID(
  viewports,
  FrameOfReferenceUID
) {
  const numViewports = viewports.length;
  const viewportsWithFrameOfReferenceUID = [];

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp];
    const scene = viewport.getScene();

    if (scene.getFrameOfReferenceUID() === FrameOfReferenceUID) {
      viewportsWithFrameOfReferenceUID.push(viewport);
    }
  }

  return viewportsWithFrameOfReferenceUID;
}
