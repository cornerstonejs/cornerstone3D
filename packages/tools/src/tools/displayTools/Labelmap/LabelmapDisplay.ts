import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import { cache, getEnabledElementByIds, Types } from '@cornerstonejs/core'

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState'
import { LabelmapRepresentation } from '../../../types/SegmentationRepresentationTypes'
import Representations from '../../../enums/SegmentationRepresentations'
import { getToolGroupByToolGroupId } from '../../../store/ToolGroupManager'
import type { LabelmapConfig } from './LabelmapConfig'
import {
  SegmentationConfig,
  ToolGroupSpecificSegmentationData,
} from '../../../types/SegmentationStateTypes'

import {
  internalAddSegmentationToElement,
  internalRemoveSegmentationFromElement,
} from '../../../stateManagement/segmentation/helpers'

import { deepMerge } from '../../../utilities'
import { IToolGroup } from '../../../types'

const MAX_NUMBER_COLORS = 255
const labelMapConfigCache = new Map()

/**
 * For each viewport, and for each segmentation, set the segmentation for the viewport's enabled element
 * Initializes the global and viewport specific state for the segmentation in the
 * SegmentationStateManager.
 * @param toolGroup - the tool group that contains the viewports
 * @param segmentationDataArray - the array of segmentation data
 */
async function addSegmentationData(
  toolGroupId: string,
  segmentationData: Partial<ToolGroupSpecificSegmentationData>,
  toolGroupSpecificConfig?: SegmentationConfig
): Promise<void> {
  const { volumeId, segmentationDataUID, representation } = segmentationData

  await _addLabelmapToToolGroupViewports(toolGroupId, segmentationData)

  // Viewport Specific Rendering State for the segmentation
  // Merging the default configuration with the configuration passed in the arguments
  const segmentsHidden =
    segmentationData.segmentsHidden !== undefined
      ? segmentationData.segmentsHidden
      : (new Set() as Set<number>)

  const visibility =
    segmentationData.visibility !== undefined
      ? segmentationData.visibility
      : true

  const colorLUTIndex =
    segmentationData.colorLUTIndex !== undefined
      ? segmentationData.colorLUTIndex
      : 0

  const active =
    segmentationData.active !== undefined ? segmentationData.active : true

  const cfun =
    representation.config.cfun || vtkColorTransferFunction.newInstance()
  const ofun = representation.config.ofun || vtkPiecewiseFunction.newInstance()

  const mergedSegmentationData = {
    volumeId,
    segmentationDataUID,
    segmentsHidden,
    visibility,
    colorLUTIndex,
    active,
    representation: {
      type: Representations.Labelmap,
      config: {
        cfun,
        ofun,
      },
    },
  } as ToolGroupSpecificSegmentationData

  // Update the toolGroup specific configuration
  if (toolGroupSpecificConfig) {
    // Since setting configuration on toolGroup will trigger a segmentationState
    // updated event, we don't want to trigger the event twice, so we suppress
    // the first one
    const suppressEvents = true
    const currentToolGroupConfig =
      SegmentationState.getSegmentationConfig(toolGroupId)

    const mergedConfig = deepMerge(
      currentToolGroupConfig,
      toolGroupSpecificConfig
    )

    SegmentationState.setSegmentationConfig(
      toolGroupId,
      {
        renderInactiveSegmentations:
          mergedConfig.renderInactiveSegmentations || true,
        representations: {
          ...mergedConfig.representations,
        },
      },
      suppressEvents
    )
  }

  // Add data first
  SegmentationState.addSegmentationData(toolGroupId, mergedSegmentationData)
}

/**
 * For each viewport, and for each segmentation, set the segmentation for the viewport's enabled element
 * Initializes the global and viewport specific state for the segmentation in the
 * SegmentationStateManager.
 * @param toolGroup - the tool group that contains the viewports
 * @param segmentationDataArray - the array of segmentation data
 */
function removeSegmentationData(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  _removeLabelmapFromToolGroupViewports(toolGroupId, segmentationDataUID)
  SegmentationState.removeSegmentationData(toolGroupId, segmentationDataUID)
}

/**
 * It takes the enabled element, the segmentation UID, and the configuration, and
 * it sets the segmentation for the enabled element as a labelmap
 * @param enabledElement - The cornerstone enabled element
 * @param segmentationUID - The UID of the segmentation to be rendered.
 * @param configuration - The configuration object for the labelmap.
 */
function render(
  viewport: Types.IViewport,
  segmentationData: ToolGroupSpecificSegmentationData,
  config: SegmentationConfig
): void {
  const {
    volumeId: labelmapUID,
    colorLUTIndex,
    active,
    representation,
    segmentationDataUID,
    visibility,
  } = segmentationData

  const labelmapRepresentation = representation as LabelmapRepresentation

  const labelmap = cache.getVolume(labelmapUID)

  if (!labelmap) {
    throw new Error(`No Labelmap found for volumeId: ${labelmapUID}`)
  }

  const actor = viewport.getActor(segmentationDataUID)
  if (!actor) {
    console.warn('No actor found for actorUID: ', segmentationDataUID)
    return
  }

  const { cfun, ofun } = labelmapRepresentation.config

  const labelmapConfig = config.representations[Representations.Labelmap]
  const renderInactiveSegmentations = config.renderInactiveSegmentations

  _setLabelmapColorAndOpacity(
    viewport.id,
    actor,
    cfun,
    ofun,
    colorLUTIndex,
    labelmapConfig,
    active,
    renderInactiveSegmentations,
    visibility
  )
}

function _setLabelmapColorAndOpacity(
  viewportId: string,
  actor: Types.ActorEntry,
  cfun: vtkColorTransferFunction,
  ofun: vtkPiecewiseFunction,
  colorLUTIndex: number,
  labelmapConfig: LabelmapConfig,
  isActiveLabelmap: boolean,
  renderInactiveSegmentations: boolean,
  visibility = true
): void {
  ofun.addPoint(0, 0)

  const fillAlpha = isActiveLabelmap
    ? labelmapConfig.fillAlpha
    : labelmapConfig.fillAlphaInactive
  const outlineWidth = isActiveLabelmap
    ? labelmapConfig.outlineWidthActive
    : labelmapConfig.outlineWidthInactive

  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.

  const colorLUT = SegmentationState.getColorLut(colorLUTIndex)
  const numColors = Math.min(256, colorLUT.length)
  const { volumeActor, uid } = actor

  const needUpdate = _needsTransferFunctionUpdateUpdate(
    viewportId,
    actor.uid,
    fillAlpha,
    colorLUTIndex
  )

  // recent change to ColorTransferFunction has aff

  if (needUpdate) {
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
      ofun.addPoint(i, segmentOpacity)
    }
    ofun.setClamping(false)
    volumeActor.getProperty().setRGBTransferFunction(0, cfun)
    volumeActor.getProperty().setScalarOpacity(0, ofun)
  }

  volumeActor.getProperty().setInterpolationTypeToNearest()

  volumeActor.getProperty().setUseLabelOutline(labelmapConfig.renderOutline)
  volumeActor.getProperty().setLabelOutlineThickness(outlineWidth)

  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible =
    visibility && (isActiveLabelmap || renderInactiveSegmentations)
  volumeActor.setVisibility(visible)
}

function _needsTransferFunctionUpdateUpdate(
  viewportId: string,
  actorUID: string,
  fillAlpha: number,
  colorLUTIndex: number
): boolean {
  const cacheUID = `${viewportId}-${actorUID}`
  const config = labelMapConfigCache.get(cacheUID)

  if (
    config &&
    config.fillAlpha === fillAlpha &&
    config.colorLUTIndex === colorLUTIndex
  ) {
    return false
  }

  labelMapConfigCache.set(cacheUID, {
    fillAlpha,
    colorLUTIndex,
  })

  return true
}

function _removeLabelmapFromToolGroupViewports(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  const toolGroup = getToolGroupByToolGroupId(toolGroupId)

  if (toolGroup === undefined) {
    throw new Error(`ToolGroup with ToolGroupId ${toolGroupId} does not exist`)
  }

  const { viewportsInfo } = toolGroup

  const segmentationData = SegmentationState.getSegmentationDataByUID(
    toolGroupId,
    segmentationDataUID
  )

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo
    const enabledElement = getEnabledElementByIds(viewportId, renderingEngineId)
    internalRemoveSegmentationFromElement(
      enabledElement.viewport.element,
      segmentationData
    )
  }
}

async function _addLabelmapToToolGroupViewports(
  toolGroupId,
  segmentationData
): Promise<void> {
  const toolGroup = getToolGroupByToolGroupId(toolGroupId) as IToolGroup
  const { viewportsInfo } = toolGroup

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo
    const enabledElement = getEnabledElementByIds(viewportId, renderingEngineId)

    if (!enabledElement) {
      throw new Error(
        `No enabled element found for rendering engine: ${renderingEngineId} and viewport: ${viewportId}`
      )
    }

    const { viewport } = enabledElement
    internalAddSegmentationToElement(viewport.element, segmentationData)
  }
}

export default {
  render,
  addSegmentationData,
  removeSegmentationData,
}
