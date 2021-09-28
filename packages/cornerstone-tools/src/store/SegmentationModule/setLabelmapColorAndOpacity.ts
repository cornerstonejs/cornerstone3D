import { getSegmentationConfig } from './segmentationConfig'
import state from './state'

const MAX_NUMBER_COLORS = 255

function setLabelmapColorAndOpacity(
  volumeActor,
  cfun,
  ofun,
  colorLUTIndex = 0
) {
  ofun.addPoint(0, 0)

  // Todo: get segment opacity from Settings
  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.
  const colorLUT = state.colorLutTables[colorLUTIndex]
  const numColors = Math.min(256, colorLUT.length)

  for (let i = 0; i < numColors; i++) {
    const color = colorLUT[i]
    cfun.addRGBPoint(
      i,
      color[0] / MAX_NUMBER_COLORS,
      color[1] / MAX_NUMBER_COLORS,
      color[2] / MAX_NUMBER_COLORS
    )

    // Set the opacity per label.
    const segmentOpacity = (color[3] / 255) * 0.9
    ofun.addPointLong(i, segmentOpacity, 0.5, 1.0)
  }

  // colorLUT.forEach((color, index) => {
  //   cfun.addRGBPoint(index, ...color.slice(0, 3).map((c) => c / 255.0)) // label "1" will be red
  //   ofun.addPoint(index, 0.9) // Red will have an opacity of 0.2.
  // })

  ofun.setClamping(false)

  volumeActor.getProperty().setRGBTransferFunction(0, cfun)
  volumeActor.getProperty().setScalarOpacity(0, ofun)
  volumeActor.getProperty().setInterpolationTypeToNearest()

  const config = getSegmentationConfig()
  volumeActor.getProperty().setUseLabelOutline(config.renderOutline)
  volumeActor.getProperty().setLabelOutlineThickness(config.outlineWidth)
}

export default setLabelmapColorAndOpacity
