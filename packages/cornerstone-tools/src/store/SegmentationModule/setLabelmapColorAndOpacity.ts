import { getSegmentationConfig } from './segmentationConfig'

// Todo: this should be settable in state
// https://www.slicer.org/w/index.php/Slicer3:2010_GenericAnatomyColors#Lookup_table
const colors = [
  {
    integerLabel: 0,
    textLabel: 'background',
    color: [0, 0, 0, 0],
  },
  {
    integerLabel: 1,
    textLabel: 'tissue',
    // color: [255, 174, 128, 255],
    color: [255, 0, 0, 255],
  },
  {
    integerLabel: 2,
    textLabel: 'bone',
    // color: [241, 214, 145, 255],
    color: [0, 255, 0, 255],
  },
  {
    integerLabel: 3,
    textLabel: 'skin',
    // color: [177, 122, 101, 255],
    color: [0, 0, 255, 255],
  },
  // ....
]

function setLabelmapColorAndOpacity(volumeActor, cfun, ofun, colorLUTIndex) {
  ofun.addPoint(0, 0)

  // Todo: Get the colors from colorLUTTables by colorLUTIndex
  // Todo: change this
  // Todo: get segment opacity from Settings
  colors.forEach(({ integerLabel, color }) => {
    cfun.addRGBPoint(integerLabel, ...color.slice(0, 3).map((c) => c / 255.0)) // label "1" will be red
    ofun.addPoint(integerLabel, 0.9) // Red will have an opacity of 0.2.
  })

  ofun.setClamping(false)

  volumeActor.getProperty().setRGBTransferFunction(0, cfun)
  volumeActor.getProperty().setScalarOpacity(0, ofun)
  volumeActor.getProperty().setInterpolationTypeToNearest()

  const config = getSegmentationConfig()
  volumeActor.getProperty().setUseLabelOutline(config.renderOutline)
  volumeActor.getProperty().setLabelOutlineThickness(config.outlineWidth)
}

export default setLabelmapColorAndOpacity
