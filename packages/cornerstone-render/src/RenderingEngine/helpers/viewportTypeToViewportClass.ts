// TODO -> Eventually we'll need to register to this list
import StackViewport from '../StackViewport'
import VolumeViewport from '../VolumeViewport'
import VIEWPORT_TYPE from '../../enums/viewportType'

const viewportTypeToViewportClass = {
  [VIEWPORT_TYPE.ORTHOGRAPHIC]: VolumeViewport,
  [VIEWPORT_TYPE.PERSPECTIVE]: VolumeViewport,
  [VIEWPORT_TYPE.STACK]: StackViewport,
}

export default viewportTypeToViewportClass
