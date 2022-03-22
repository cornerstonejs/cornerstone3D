/* eslint-disable @typescript-eslint/no-empty-function */
import { vec2 } from 'gl-matrix'

import {
  getEnabledElement,
  Settings,
  cache,
  StackViewport,
  VolumeViewport,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import { AnnotationTool } from '../base'
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState'
import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import transformPhysicalToIndex from '../../utilities/transformPhysicalToIndex'
import { Events } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../utilities/viewportFilters'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import { AnnotationModifiedEventDetail } from '../../types/EventTypes'

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportUIDs'

import {
  Annotation,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
} from '../../types'

interface ProbeAnnotation extends Annotation {
  data: {
    handles: { points: Types.Point3[] }
    cachedStats: {
      [targetUID: string]: {
        Modality: string
        index: Types.Point3
        value: number
      }
    }
    label: string
  }
}

/**
 * ProbeTool let you get the underlying voxel value by putting a probe in that
 * location. It will give index of the location and value of the voxel.
 * You can use ProbeTool in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. Probe tool's text box are dynamically
 * generated based on the viewport's underlying Modality. For instance, if
 * the viewport is displaying CT, the text box will shown the statistics in Hounsfield units,
 * and if the viewport is displaying PET, the text box will show the statistics in
 * SUV units.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * To use the ProbeTool, you first need to add it to cornerstoneTools, then create
 * a toolGroup and add the ProbeTool to it. Finally, setToolActive on the toolGroup
 *
 * ```js
 * cornerstoneTools.addTool(ProbeTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupUID')
 *
 * toolGroup.addTool(ProbeTool.toolName)
 *
 * toolGroup.addViewport('viewportUID', 'renderingEngineUID')
 *
 * toolGroup.setToolActive(ProbeTool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.
 *
 */
export default class ProbeTool extends AnnotationTool {
  static toolName = 'Probe'

  touchDragCallback: any
  mouseDragCallback: any
  editData: { annotation: any; viewportUIDsToRender: string[] } | null
  eventDispatchDetail: {
    viewportUID: string
    renderingEngineUID: string
  }
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  // Not necessary for this tool but needs to be defined since it's an abstract
  // method from the parent class.
  isPointNearTool(): boolean {
    return false
  }

  toolSelectedCallback() {}

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Probe Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): ProbeAnnotation => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
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
      const imageVolume = cache.getVolume(volumeUID)
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

    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: ProbeTool.toolName,
      },
      data: {
        label: '',
        handles: { points: [<Types.Point3>[...worldPos]] },
        cachedStats: {},
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, ProbeTool)

    addAnnotation(element, annotation)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      ProbeTool.toolName
    )

    this.editData = {
      annotation,
      viewportUIDsToRender,
    }
    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    return annotation
  }

  /**
   * It checks if the mouse click is near ProveTool, it overwrites the baseAnnotationTool
   * getHandleNearImagePoint method.
   *
   * @param element - The element that the tool is attached to.
   * @param annotation - The annotation object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLElement,
    annotation: ProbeAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = annotation
    const point = data.handles.points[0]
    const annotationCanvasCoordinate = viewport.worldToCanvas(point)

    const near =
      vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity

    if (near === true) {
      return point
    }
  }

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    annotation: ProbeAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
    const eventDetail = evt.detail
    const { element } = eventDetail

    annotation.highlighted = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      ProbeTool.toolName
    )

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      annotation,
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

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    const { annotation, viewportUIDsToRender } = this.editData

    annotation.highlighted = false

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
      removeAnnotation(element, annotation.annotationUID)
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragCallback = (evt) => {
    this.isDrawing = true
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
    const worldPos = currentPoints.world

    const { annotation, viewportUIDsToRender } = this.editData
    const { data } = annotation

    data.handles.points[0] = [...worldPos]
    annotation.invalidated = true

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

      const { annotation, viewportUIDsToRender } = this.editData
      const { data } = annotation

      annotation.highlighted = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      triggerAnnotationRenderForViewportUIDs(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return annotation.annotationUID
    }
  }

  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * it is used to draw the probe annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement
    const { element } = viewport

    let annotations = getAnnotations(element, ProbeTool.toolName)

    if (!annotations?.length) {
      return
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    )

    if (!annotations?.length) {
      return
    }

    const targetUID = this.getTargetUID(viewport)
    const renderingEngine = viewport.getRenderingEngine()

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as ProbeAnnotation
      const settings = Settings.getObjectSettings(annotation, ProbeTool)
      const annotationUID = annotation.annotationUID
      const data = annotation.data
      const point = data.handles.points[0]
      const canvasCoordinates = viewport.worldToCanvas(point)
      const color = this.getStyle(settings, 'color', annotation)

      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {
          Modality: null,
          index: null,
          value: null,
        }

        this._calculateCachedStats(annotation, renderingEngine, enabledElement)
      } else if (annotation.invalidated) {
        this._calculateCachedStats(annotation, renderingEngine, enabledElement)

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = annotation.metadata

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
        ProbeTool.toolName,
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
          ProbeTool.toolName,
          annotationUID,
          textUID,
          textLines,
          [textCanvasCoorinates[0], textCanvasCoorinates[1]],
          this.getLinkedTextBoxStyle(settings, annotation)
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

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data
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
      const index = transformPhysicalToIndex(imageData, worldPos)

      index[0] = Math.round(index[0])
      index[1] = Math.round(index[1])
      index[2] = Math.round(index[2])

      if (csUtils.indexWithinDimensions(index, dimensions)) {
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

      annotation.invalidated = false

      // Dispatching annotation modified
      const eventType = Events.ANNOTATION_MODIFIED

      const eventDetail: AnnotationModifiedEventDetail = {
        annotation,
        viewportUID,
        renderingEngineUID,
      }

      triggerEvent(eventTarget, eventType, eventDetail)
    }

    return cachedStats
  }
}
