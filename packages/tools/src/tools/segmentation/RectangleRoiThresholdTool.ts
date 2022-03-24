import {
  getEnabledElement,
  cache,
  Settings,
  StackViewport,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import { addAnnotation, getAnnotations } from '../../stateManagement'
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking'
import { Events } from '../../enums'

import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters'
import { hideElementCursor } from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds'

import { Annotation, PublicToolProps, ToolProps, EventTypes } from '../../types'
import { AnnotationModifiedEventDetail } from '../../types/EventTypes'
import RectangleRoiTool from '../annotation/RectangleRoiTool'

export interface RectangleRoiThresholdAnnotation extends Annotation {
  metadata: {
    cameraPosition?: Types.Point3
    cameraFocalPoint?: Types.Point3
    viewPlaneNormal?: Types.Point3
    viewUp?: Types.Point3
    annotationUID?: string
    FrameOfReferenceUID: string
    referencedImageId?: string
    toolName: string
    enabledElement: any // Todo: how to remove this from the annotation??
    volumeId: string
  }
  data: {
    label: string
    handles: {
      points: Types.Point3[]
      activeHandleIndex: number | null
    }
    // segmentationUID: string
  }
}

/**
 * This tool is exactly the RectangleRoiTool but only draws a rectangle on the image,
 * and by using utility functions such as thresholdByRange and thresholdByRoiStat it can be used to
 * create a segmentation. This tool, however, does not calculate the statistics
 * as RectangleRoiTool does.
 */
export default class RectangleRoiThresholdTool extends RectangleRoiTool {
  static toolName = 'RectangleRoiThreshold'
  _throttledCalculateCachedStats: any
  editData: {
    annotation: any
    viewportIDsToRender: string[]
    handleIndex?: number
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
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

  /**
   * Based on the current position of the mouse and the enabledElement it creates
   * the edit data for the tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (evt: EventTypes.MouseDownActivateEventType) => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    let referencedImageId, volumeId
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      volumeId = this.getTargetId(viewport)
      const imageVolume = cache.getVolume(volumeId)
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

    // Todo: how not to store enabledElement on the annotation, segmentationModule needs the element to
    // decide on the active segmentIndex, active segmentationIndex etc.
    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: RectangleRoiThresholdTool.toolName,
        volumeId,
      },
      data: {
        label: '',
        handles: {
          // No need a textBox
          textBox: {
            hasMoved: false,
            worldPosition: null,
            worldBoundingBox: null,
          },
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
        segmentationUID: null,
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, RectangleRoiThresholdTool)

    addAnnotation(element, annotation)

    const viewportIDsToRender = getViewportIdsWithToolToRender(
      element,
      RectangleRoiThresholdTool.toolName
    )

    this.editData = {
      annotation,
      viewportIDsToRender,
      handleIndex: 3,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIDsToRender)

    return annotation
  }

  /**
   * it is used to draw the RectangleRoi Threshold annotation in each
   * request animation frame.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport, renderingEngineId } = enabledElement
    const { element } = viewport
    let annotations = getAnnotations(
      element,
      RectangleRoiThresholdTool.toolName
    )

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

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as RectangleRoiThresholdAnnotation
      const settings = Settings.getObjectSettings(
        annotation,
        RectangleRoiThresholdTool
      )
      const annotationUID = annotation.annotationUID

      const data = annotation.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', annotation)
      const lineDash = this.getStyle(settings, 'lineDash', annotation)
      const color = this.getStyle(settings, 'color', annotation)

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      // Todo: This is not correct way to add the event trigger,
      // this will trigger on all mouse hover too. Problem is that we don't
      // have a cached stats mechanism for this tool yet?
      const eventType = Events.ANNOTATION_MODIFIED

      const eventDetail: AnnotationModifiedEventDetail = {
        annotation,
        viewportId: viewport.uid,
        renderingEngineId,
      }

      triggerEvent(eventTarget, eventType, eventDetail)

      let activeHandleCanvasCoords

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]]
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0'

        drawHandlesSvg(
          svgDrawingHelper,
          RectangleRoiThresholdTool.toolName,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        )
      }

      const rectangleUID = '0'
      drawRectSvg(
        svgDrawingHelper,
        RectangleRoiThresholdTool.toolName,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        }
      )
    }
  }
}
