import type vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import type vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import Representations from '../enums/SegmentationRepresentations'

export type LabelmapRepresentation = {
  type: typeof Representations.Labelmap
  config: {
    cfun?: vtkColorTransferFunction
    ofun?: vtkPiecewiseFunction
  }
}

/**
 * Todo: Other representations
 */

export type SegmentationRepresentation = LabelmapRepresentation
