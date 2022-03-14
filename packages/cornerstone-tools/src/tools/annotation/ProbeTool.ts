/* eslint-disable @typescript-eslint/no-empty-function */
import { vec2 } from 'gl-matrix'

import {
  getEnabledElement,
  Settings,
  getVolume,
  StackViewport,
  VolumeViewport,
  triggerEvent,
  eventTarget,
  Utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { BaseAnnotationTool } from '../base'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement/annotation/toolState'
import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { indexWithinDimensions } from '../../util/vtkjs'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import { MeasurementModifiedEventData } from '../../types/EventTypes'

import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import {
  ToolSpecificToolData,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
} from '../../types'

interface ProbeSpecificToolData extends ToolSpecificToolData {
  data: {
    invalidated: boolean
    handles: { points: Types.Point3[] }
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
    renderingEngineUID: string
  }
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      name: 'Probe',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps)

    /**
     * Will only fire for cornerstone events:
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
  isPointNearTool(): boolean {
    return false
  }

  toolSelectedCallback() {}

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Probe ToolData and stores it in the toolStateManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The toolData object.
   *
   */
  addNewMeasurement = (
    evt: EventTypes.MouseDownActivateEventType
  ): ProbeSpecificToolData => {
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
      const volumeUID = this.getTargetUID(viewport)
      const imageVolume = getVolume(volumeUID)
      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      )
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':')
      referencedImageId = referencedImageId.substring(colonIndex + 1)
    }

    const toolData = {
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        label: '',
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: { points: [<Types.Point3>[...worldPos]] },
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

  /**
   * It checks if the mouse click is near ProveTool, it overwrites the baseAnnotationTool
   * getHandleNearImagePoint method.
   *
   * @param element - The element that the tool is attached to.
   * @param toolData - The tool data object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLElement,
    toolData: ToolSpecificToolData,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const point = data.handles.points[0]
    const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

    const near =
      vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity

    if (near === true) {
      return point
    }
  }

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    toolData: ToolSpecificToolData,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
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

  _mouseUpCallback(
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender } = this.editData
    const { data } = toolData

    data.active = false

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    const { viewportUID } = enabledElement
    this.eventDispatchDetail = {
      viewportUID,
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

  cancel = (element: HTMLElement) => {
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

    // element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify(element) {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * it is used to draw the probe annotation data in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderToolData = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement
    const { element } = viewport

    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (!toolState?.length) {
      return
    }

    const targetUID = this.getTargetUID(viewport)
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
            const stackTargetUID = this.getTargetUID(vp)
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

  _calculateCachedStats(toolData, renderingEngine, enabledElement) {
    const data = toolData.data
    const { viewportUID, renderingEngineUID } = enabledElement

    const worldPos = data.handles.points[0]
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { image, viewport } = this.getTargetUIDViewportAndImage(
        targetUID,
        renderingEngine
      )

      const { dimensions, scalarData, imageData, metadata } = image

      const modality = metadata.Modality

      //@ts-ignore
      const index = imageData.worldToIndex(worldPos) as Types.Point3

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

        const values = this._getValueForModality(value, image, modality)

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

      const eventDetail: MeasurementModifiedEventData = {
        toolData,
        viewportUID,
        renderingEngineUID,
      }

      triggerEvent(eventTarget, eventType, eventDetail)
    }
  }
}
