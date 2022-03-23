import type { vtkColorTransferFunction } from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import type { vtkPiecewiseFunction } from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import Representations from '../enums/SegmentationRepresentations'

/**
 * Labelmap representation type
 */
export type LabelmapRepresentation = {
  /** labelmap representation type  */
  type: typeof Representations.Labelmap
  /** config */
  config: {
    /** color transfer function */
    cfun?: vtkColorTransferFunction
    /** opacity transfer function */
    ofun?: vtkPiecewiseFunction
  }
}

/**
 * Segmentation representation. Currently only Labelmap is supported.
 */
export type SegmentationRepresentation = LabelmapRepresentation
