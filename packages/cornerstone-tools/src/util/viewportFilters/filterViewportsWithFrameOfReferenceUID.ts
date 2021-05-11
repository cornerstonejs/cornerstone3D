/**
 * @function filterViewportsWithFrameOfReferenceUID Given an array of viewports,
 * returns a list of viewports that are viewing a worldspace with the given
 * `FrameOfReferenceUID`.
 *
 * @param {object[]} viewports An array of viewports.
 * @param {string} FrameOfReferenceUID The UID defining a particular worldspace/Frame Of Reference.
 *
 * @returns {object[]} A filtered array of viewports.
 */
export default function filterViewportsWithFrameOfReferenceUID(
  viewports,
  FrameOfReferenceUID
) {
  const numViewports = viewports.length
  const viewportsWithFrameOfReferenceUID = []

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp]
    // const scene = viewport.getScene()

    if (viewport.getFrameOfReferenceUID() === FrameOfReferenceUID) {
      viewportsWithFrameOfReferenceUID.push(viewport)
    }
  }

  return viewportsWithFrameOfReferenceUID
}
