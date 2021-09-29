import { vtkVolume } from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import defaultConfig, { ISegmentationConfig } from './segmentationConfig'
import state from './state'
import _cloneDeep from 'lodash.clonedeep'

const MAX_NUMBER_COLORS = 255

function setLabelmapColorAndOpacity(
  volumeActor: vtkVolume,
  cfun: vtkColorTransferFunction,
  ofun: vtkPiecewiseFunction,
  colorLUTIndex: number,
  labelmapConfig: Partial<ISegmentationConfig>,
  isActiveLabelmap: boolean,
  visibility = true
): void {
  ofun.addPoint(0, 0)

  let config = _cloneDeep(defaultConfig)

  // if custom config per labelmap
  if (labelmapConfig) {
    config = Object.assign(config, labelmapConfig)
  }

  const fillAlpha = isActiveLabelmap
    ? config.fillAlpha
    : config.fillAlphaInactive
  const outlineWidth = isActiveLabelmap
    ? config.outlineWidthActive
    : config.outlineWidthInactive

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
    const segmentOpacity = (color[3] / 255) * fillAlpha
    ofun.addPointLong(i, segmentOpacity, 0.5, 1.0)
  }

  ofun.setClamping(false)

  volumeActor.getProperty().setRGBTransferFunction(0, cfun)
  volumeActor.getProperty().setScalarOpacity(0, ofun)
  volumeActor.getProperty().setInterpolationTypeToNearest()

  volumeActor.getProperty().setUseLabelOutline(config.renderOutline)
  volumeActor.getProperty().setLabelOutlineThickness(outlineWidth)

  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible =
    visibility && (isActiveLabelmap || config.renderInactiveLabelmaps)
  volumeActor.setVisibility(visible)
}

export default setLabelmapColorAndOpacity
