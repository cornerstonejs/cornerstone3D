import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'

const { BlendMode } = vtkConstants

enum BlendModes {
  NONE = BlendMode.NONE,
  COMPOSITE = BlendMode.COMPOSITE,
  MAXIMUM_INTENSITY_BLEND = BlendMode.MAXIMUM_INTENSITY_BLEND,
  MAXIMUM_INTENSITY_PROJECTION = BlendMode.MAXIMUM_INTENSITY_PROJECTION,
}

export default BlendModes
