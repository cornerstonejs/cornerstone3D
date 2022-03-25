import type { vtkColorTransferFunction } from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import type { vtkPiecewiseFunction } from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

/**
 * Labelmap representation type
 */
export type LabelmapRenderingConfig = {
  /** color transfer function */
  cfun?: vtkColorTransferFunction
  /** opacity transfer function */
  ofun?: vtkPiecewiseFunction
}

export type LabelmapRepresentationData = {
  volumeId: string
  referenceVolumeId?: string
}
