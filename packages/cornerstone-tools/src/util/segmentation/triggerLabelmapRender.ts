import RenderingEngine from '@precisionmetrics/cornerstone-render/src/RenderingEngine'
import { IImageVolume } from '@precisionmetrics/cornerstone-render/src/types'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'

/**
 *
 * @param {RenderingEngine} renderingEngine renderingEngine
 * @param {IImageVolume} labelmap labelmapVolume
 * @param {vtkImageData} imageData labelmap imageData
 * @param {number} modifiedSlices modified slices as an array
 */
export default function triggerLabelmapRender(
  renderingEngine: RenderingEngine,
  labelmap: IImageVolume,
  imageData: vtkImageData,
  modifiedSlices?: number
): void {
  let modifiedSlicesToUse

  if (!modifiedSlices) {
    // Use all slices of the image to update the texture
    const numSlices = imageData.getDimensions()[2]
    modifiedSlicesToUse = [...Array(numSlices).keys()]
  }

  // todo: this renders all viewports, only renders viewports that have the modified labelmap actor
  // right now this is needed to update the labelmap on other viewports that have it (pt)
  modifiedSlicesToUse.forEach((i) => {
    labelmap.vtkOpenGLTexture.setUpdatedFrame(i)
  })

  // Todo: seems like we don't need to set the data back again
  // vtkImageData.getPointData().getScalars().setData(scalarData)
  imageData.modified()
  renderingEngine.render()
}
