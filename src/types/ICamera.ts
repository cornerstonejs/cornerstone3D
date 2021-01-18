import Point3 from './Point3'

interface ICamera {
  clippingRange?: Point3
  focalPoint?: Point3
  parallelProjection?: boolean
  parallelScale?: number
  position?: Point3
  viewAngle?: number
  viewPlaneNormal?: Point3
  viewUp?: Point3
}

export default ICamera
