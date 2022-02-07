/* eslint-disable @typescript-eslint/no-empty-function */
import { BaseAnnotationTool } from '../base'
// ~~ VTK Viewport
import {
  getEnabledElement,
  Settings,
  getVolume,
  Types,
  StackViewport,
  VolumeViewport,
  triggerEvent,
  eventTarget,
} from '@precisionmetrics/cornerstone-render'
import { getImageIdForTool, getToolStateForDisplay } from '../../util/planar'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement/toolState'
import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg'
import { vec2 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { indexWithinDimensions } from '../../util/vtkjs'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point3 } from '../../types'

interface ProbeSpecificToolData extends ToolSpecificToolData {
  data: {
    invalidated: boolean
    handles: { points: Point3[] }
    cachedStats: any
    active: boolean
  }
}
export default class ProbeTool extends BaseAnnotationTool {
  touchDragCallback: any
  mouseDragCallback: any
  editData: { toolData: any; viewportUIDsToRender: string[] } | null
  _configuration: any
  eventDispatchDetail: {
    viewportUID: string
    sceneUID: string
    renderingEngineUID: string
  }
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Probe',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true, preventHandleOutsideImage: false },
    })

    /**
     * Will only fire fore cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this._activateModify = this._activateModify.bind(this)
    this._deactivateModify = this._deactivateModify.bind(this)
    this._mouseUpCallback = this._mouseUpCallback.bind(this)
    this._mouseDragCallback = this._mouseDragCallback.bind(this)
  }

  // Not necessary for this tool but needs to be defined since it's an abstract
  // method from the parent class.
  pointNearTool(): boolean {
    return false
  }

  toolSelectedCallback() {}

  addNewMeasurement(evt: CustomEvent): ProbeSpecificToolData {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true
    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    let referencedImageId
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      const { volumeUID } = this.configuration
      const imageVolume = getVolume(volumeUID)
      referencedImageId = getImageIdForTool(
        worldPos,
        viewPlaneNormal,
        viewUp,
        imageVolume
      )
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':')
      referencedImageId = referencedImageId.substring(colonIndex + 1)
    }

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: { points: [<Point3>[...worldPos]] },
        cachedStats: {},
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, ProbeTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
    }
    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    return toolData
  }

  getHandleNearImagePoint(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const point = data.handles.points[0]
    const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

    const near =
      vec2.distance(canvasCoords, <vec2>toolDataCanvasCoordinate) < proximity

    if (near === true) {
      return point
    }

    return near
  }

  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      toolData,
      viewportUIDsToRender,
    }
    this._activateModify(element)

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  _mouseUpCallback(evt) {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender } = this.editData
    const { data } = toolData

    data.active = false

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    const { viewportUID, sceneUID } = enabledElement
    this.eventDispatchDetail = {
      viewportUID,
      sceneUID,
      renderingEngineUID: renderingEngine.uid,
    }

    this._deactivateModify(element)

    resetElementCursor(element)

    this.editData = null
    this.isDrawing = false

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeToolState(element, toolData)
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragCallback(evt) {
    this.isDrawing = true
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const { toolData, viewportUIDsToRender } = this.editData
    const { data } = toolData

    data.handles.points[0] = [...worldPos]
    data.invalidated = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  cancel(element) {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false
      this._deactivateModify(element)
      resetElementCursor(element)

      const { toolData, viewportUIDsToRender } = this.editData
      const { data } = toolData

      data.active = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      triggerAnnotationRenderForViewportUIDs(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return toolData.metadata.toolDataUID
    }
  }

  _activateModify(element) {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify(element) {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   */
  filterInteractableToolStateForElement(element, toolState) {
    if (!toolState || !toolState.length) {
      return
    }

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    return getToolStateForDisplay(viewport, toolState)
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { element } = eventData
    const { enabledElement } = svgDrawingHelper

    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (!toolState?.length) {
      return
    }

    const { viewport } = enabledElement

    let targetUID
    if (viewport instanceof StackViewport) {
      targetUID = this._getTargetStackUID(viewport)
    } else if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      targetUID = this._getTargetVolumeUID(scene)
    } else {
      throw new Error(`Viewport Type not supported: ${viewport.type}`)
    }

    const renderingEngine = viewport.getRenderingEngine()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as ProbeSpecificToolData
      const settings = Settings.getObjectSettings(toolData, ProbeTool)
      const annotationUID = toolData.metadata.toolDataUID
      const data = toolData.data
      const point = data.handles.points[0]
      const canvasCoordinates = viewport.worldToCanvas(point)
      const color = this.getStyle(settings, 'color', toolData)

      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {}
        this._calculateCachedStats(toolData, renderingEngine, enabledElement)
      } else if (data.invalidated) {
        this._calculateCachedStats(toolData, renderingEngine, enabledElement)

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = toolData.metadata

          // todo: this is not efficient, but necessary
          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          const viewports = renderingEngine.getViewports()
          viewports.forEach((vp) => {
            const stackTargetUID = this._getTargetStackUID(vp)
            // only delete the cachedStats for the stackedViewports if the tool
            // is dragged inside the volume and the stackViewports are not at the
            // referencedImageId for the tool
            if (
              vp instanceof StackViewport &&
              !vp.getCurrentImageId().includes(referencedImageId) &&
              data.cachedStats[stackTargetUID]
            ) {
              delete data.cachedStats[stackTargetUID]
            }
          })
        }
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      const handleGroupUID = '0'

      drawHandlesSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        handleGroupUID,
        [canvasCoordinates],
        { color }
      )

      const textLines = this._getTextLines(data, targetUID)
      if (textLines) {
        const textCanvasCoorinates = [
          canvasCoordinates[0] + 6,
          canvasCoordinates[1] - 6,
        ]

        const textUID = '0'
        drawTextBoxSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          textUID,
          textLines,
          [textCanvasCoorinates[0], textCanvasCoorinates[1]],
          this.getLinkedTextBoxStyle(settings, toolData)
        )
      }
    }
  }

  _getTextLines(data, targetUID) {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { index, Modality, value, SUVBw, SUVLbm, SUVBsa } = cachedVolumeStats

    if (value === undefined && SUVBw === undefined) {
      return
    }

    const textLines = []

    textLines.push(`(${index[0]}, ${index[1]}, ${index[2]})`)

    if (Modality === 'PT') {
      // Check if we have scaling for the other 2 SUV types for the PET.
      // If we have scaling, value should be undefined
      if (value) {
        textLines.push(`${value.toFixed(2)} SUV`)
      } else {
        textLines.push(`${SUVBw.toFixed(2)} SUV bw`)

        if (SUVLbm) {
          textLines.push(`${SUVLbm.toFixed(2)} SUV lbm`)
        }
        if (SUVBsa) {
          textLines.push(`${SUVBsa.toFixed(2)} SUV bsa`)
        }
      }
    } else if (Modality === 'CT') {
      textLines.push(`${value.toFixed(2)} HU`)
    } else {
      textLines.push(`${value.toFixed(2)} MO`)
    }

    return textLines
  }

  _getValueForModality(value, imageVolume, modality) {
    const values = {}

    if (modality === 'PT') {
      // Check if we have scaling for the other 2 SUV types for the PET.
      if (
        imageVolume.scaling.PET &&
        (imageVolume.scaling.PET.suvbwToSuvbsa ||
          imageVolume.scaling.PET.suvbwToSuvlbm)
      ) {
        const { suvbwToSuvlbm, suvbwToSuvbsa } = imageVolume.scaling.PET

        values['SUVBw'] = value

        if (suvbwToSuvlbm) {
          const SUVLbm = value * suvbwToSuvlbm

          values['SUVLbm'] = SUVLbm
        }

        if (suvbwToSuvlbm) {
          const SUVBsa = value * suvbwToSuvbsa

          values['SUVBsa'] = SUVBsa
        }
      } else {
        values['value'] = value
      }
    } else {
      values['value'] = value
    }

    return values
  }

  _getImageVolumeFromTargetUID(targetUID, renderingEngine) {
    let imageVolume, viewport
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':')
      const viewportUID = targetUID.substring(coloneIndex + 1)
      viewport = renderingEngine.getViewport(viewportUID)
      imageVolume = viewport.getImageData()
    } else {
      imageVolume = getVolume(targetUID)
    }

    return { imageVolume, viewport }
  }

  _calculateCachedStats(toolData, renderingEngine, enabledElement) {
    const data = toolData.data
    const { viewportUID, renderingEngineUID, sceneUID } = enabledElement

    const worldPos = data.handles.points[0]
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { imageVolume, viewport } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      )

      const { dimensions, scalarData, imageData, metadata } = imageVolume

      const modality = metadata.Modality
      const index = imageData.worldToIndex(worldPos)

      index[0] = Math.floor(index[0])
      index[1] = Math.floor(index[1])
      index[2] = Math.floor(index[2])

      if (indexWithinDimensions(index, dimensions)) {
        this.isHandleOutsideImage = false
        const yMultiple = dimensions[0]
        const zMultiple = dimensions[0] * dimensions[1]

        const value =
          scalarData[index[2] * zMultiple + index[1] * yMultiple + index[0]]

        // Index[2] for stackViewport is always 0, but for visualization
        // we reset it to be imageId index
        if (viewport instanceof StackViewport) {
          index[2] = viewport.getCurrentImageIdIndex()
        }

        const values = this._getValueForModality(value, imageVolume, modality)

        cachedStats[targetUID] = {
          index,
          ...values,
          Modality: modality,
        }
      } else {
        this.isHandleOutsideImage = true
        cachedStats[targetUID] = {
          index,
          Modality: modality,
        }
      }

      data.invalidated = false

      // Dispatching measurement modified
      const eventType = EVENTS.MEASUREMENT_MODIFIED

      const eventDetail = {
        toolData,
        viewportUID,
        renderingEngineUID,
        sceneUID: sceneUID,
      }

      triggerEvent(eventTarget, eventType, eventDetail)
    }
  }

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`
  }

  _getTargetVolumeUID(scene) {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    const volumeActors = scene.getVolumeActors()

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return
    }

    return volumeActors[0].uid
  }
}
