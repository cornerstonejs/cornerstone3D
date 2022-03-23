import { AnnotationTool } from './base'

import {
  getEnabledElementByUIDs,
  getEnabledElement,
  utilities as csUtils,
} from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState'
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg'
import { vec2, vec3 } from 'gl-matrix'
import { state } from '../store'
import { Events } from '../enums'
import { getViewportUIDsWithToolToRender } from '../utilities/viewportFilters'
import { resetElementCursor, hideElementCursor } from '../cursors/elementCursor'
import { math } from '../utilities'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import { lineSegment } from '../utilities/math'
import {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
} from '../types'
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking'
import triggerAnnotationRenderForViewportUIDs from '../utilities/triggerAnnotationRenderForViewportUIDs'
import { MouseDragEventType } from '../types/EventTypes'

const { liangBarksyClip } = math.vec2

// TODO: nested config is weird
interface ToolConfiguration {
  configuration?: {
    getReferenceLineColor?: (viewportUID: string) => string
    getReferenceLineControllable?: (viewportUID: string) => boolean
    getReferenceLineDraggableRotatable?: (viewportUID: string) => boolean
    getReferenceLineSlabThicknessControlsOn?: (viewportUID: string) => boolean
    shadow?: boolean
  }
}

type ViewportInputs = Array<Types.IViewportUID>

interface CrosshairsAnnotation extends Annotation {
  data: {
    handles: {
      rotationPoints: any[] // rotation handles, used for rotation interactions
      slabThicknessPoints: any[] // slab thickness handles, used for setting the slab thickness
      activeOperation: number | null // 0 translation, 1 rotation handles, 2 slab thickness handles
      toolCenter: Types.Point3
    }
    activeViewportUIDs: string[] // a list of the viewport uids connected to the reference lines being translated
    viewportUID: string
  }
}

function defaultReferenceLineColor() {
  return 'rgb(200, 200, 200)'
}

function defaultReferenceLineControllable() {
  return true
}

function defaultReferenceLineDraggableRotatable() {
  return true
}

function defaultReferenceLineSlabThicknessControlsOn() {
  return false
}

const OPERATION = {
  DRAG: 1,
  ROTATE: 2,
  SLAB: 3,
}

const EPSILON = 1e-3

/**
 * CrosshairsTool is a tool that provides reference lines between different viewports
 * of a toolGroup. Using crosshairs, you can jump to a specific location in one
 * viewport and the rest of the viewports in the toolGroup will be aligned to that location.
 * Crosshairs have grababble handles that can be used to rotate and translate the
 * reference lines. They can also be used to set the slab thickness of the viewports
 * by modifying the slab thickness handles.
 *
 */
export default class CrosshairsTool extends AnnotationTool {
  static toolName = 'Crosshairs'

  toolCenter: Types.Point3 = [0, 0, 0] // NOTE: it is assumed that all the active/linked viewports share the same crosshair center.
  // This because the rotation operation rotates also all the other active/intersecting reference lines of the same angle
  _getReferenceLineColor?: (viewportUID: string) => string
  _getReferenceLineControllable?: (viewportUID: string) => boolean
  _getReferenceLineDraggableRotatable?: (viewportUID: string) => boolean
  _getReferenceLineSlabThicknessControlsOn?: (viewportUID: string) => boolean
  editData: {
    annotation: any
  } | null

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        shadow: true,
        // Auto pan is a configuration which will update pan
        // other viewports in the toolGroup if the center of the crosshairs
        // is outside of the viewport. This might be useful for the case
        // when the user is scrolling through an image (usually in the zoomed view)
        // and the crosshairs will eventually get outside of the viewport for
        // the other viewports.
        autoPan: {
          enabled: false,
          panSize: 10,
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps)

    this._getReferenceLineColor =
      toolProps.configuration?.getReferenceLineColor ||
      defaultReferenceLineColor
    this._getReferenceLineControllable =
      toolProps.configuration?.getReferenceLineControllable ||
      defaultReferenceLineControllable
    this._getReferenceLineDraggableRotatable =
      toolProps.configuration?.getReferenceLineDraggableRotatable ||
      defaultReferenceLineDraggableRotatable
    this._getReferenceLineSlabThicknessControlsOn =
      toolProps.configuration?.getReferenceLineSlabThicknessControlsOn ||
      defaultReferenceLineSlabThicknessControlsOn
  }

  /**
   * Gets the camera from the viewport, and adds crosshairs annotation for the viewport
   * to the annotationManager. If any annotation is found in the annotationManager, it
   * overwrites it.
   * @param viewportInfo - The viewportInfo for the viewport to add the crosshairs
   * @returns viewPlaneNormal and center of viewport canvas in world space
   */
  initializeViewport = ({
    renderingEngineUID,
    viewportUID,
  }: Types.IViewportUID): {
    normal: Types.Point3
    point: Types.Point3
  } => {
    const enabledElement = getEnabledElementByUIDs(
      viewportUID,
      renderingEngineUID
    )
    const { FrameOfReferenceUID, viewport } = enabledElement
    const { element } = viewport
    const { position, focalPoint, viewPlaneNormal } = viewport.getCamera()

    // Check if there is already annotation for this viewport
    let annotations = getAnnotations(element, CrosshairsTool.toolName)
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    )

    if (annotations.length) {
      // If found, it will override it by removing the annotation and adding it later
      removeAnnotation(element, annotations[0].annotationUID)
    }

    const annotation = {
      highlighted: false,
      metadata: {
        cameraPosition: <Types.Point3>[...position],
        cameraFocalPoint: <Types.Point3>[...focalPoint],
        FrameOfReferenceUID,
        toolName: CrosshairsTool.toolName,
      },
      data: {
        handles: {
          rotationPoints: [], // rotation handles, used for rotation interactions
          slabThicknessPoints: [], // slab thickness handles, used for setting the slab thickness
          toolCenter: this.toolCenter,
        },
        // Todo: add enum for active Operations
        activeOperation: null, // 0 translation, 1 rotation handles, 2 slab thickness handles
        activeViewportUIDs: [], // a list of the viewport uids connected to the reference lines being translated
        viewportUID,
      },
    }

    resetElementCursor(element)

    addAnnotation(element, annotation)

    return {
      normal: viewPlaneNormal,
      point: viewport.canvasToWorld([
        viewport.sWidth / 2,
        viewport.sHeight / 2,
      ]),
    }
  }

  /**
   * When activated, it initializes the crosshairs. It begins by computing
   * the intersection of viewports associated with the crosshairs instance.
   * When all three views are accessible, the intersection (e.g., crosshairs tool centre)
   * will be an exact point in space; however, with two viewports, because the
   * intersection of two planes is a line, it assumes the last view is between the centre
   * of the two rendering viewports.
   * @param viewports Array of viewportInputs which each item containing {viewportUID, renderingEngineUID}
   */
  init = (viewports: ViewportInputs): void => {
    if (!viewports.length || viewports.length === 1) {
      throw new Error(
        'For crosshairs to operate, at least two viewports must be given.'
      )
    }

    // Todo: handle two same view viewport, or more than 3 viewports
    const [firstViewport, secondViewport, thirdViewport] = viewports

    // Initialize first viewport
    const { normal: normal1, point: point1 } =
      this.initializeViewport(firstViewport)

    // Initialize second viewport
    const { normal: normal2, point: point2 } =
      this.initializeViewport(secondViewport)

    let normal3 = <Types.Point3>[0, 0, 0]
    let point3 = vec3.create()

    // If there are three viewports
    if (thirdViewport) {
      ;({ normal: normal3, point: point3 } =
        this.initializeViewport(thirdViewport))
    } else {
      // If there are only two views (viewport) associated with the crosshairs:
      // In this situation, we don't have a third information to find the
      // exact intersection, and we "assume" the third view is looking at
      // a location in between the first and second view centers
      vec3.add(point3, point1, point2)
      vec3.scale(point3, point3, 0.5)
      vec3.cross(normal3, normal1, normal2)
    }

    // Planes of each viewport
    const firstPlane = csUtils.planar.planeEquation(normal1, point1)
    const secondPlane = csUtils.planar.planeEquation(normal2, point2)
    const thirdPlane = csUtils.planar.planeEquation(normal3, point3)

    // Calculating the intersection of 3 planes
    // prettier-ignore
    this.toolCenter = csUtils.planar.threePlaneIntersection(firstPlane, secondPlane, thirdPlane)
  }

  /**
   * addNewAnnotation acts as jump for the crosshairs tool. It is called when
   * the user clicks on the image. It does not store the annotation in the stateManager though.
   *
   * @param evt - The mouse event
   * @param interactionType - The type of interaction (e.g., mouse, touch, etc.)
   * @returns Crosshairs annotation
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType,
    interactionType: string
  ): CrosshairsAnnotation => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    const { currentPoints } = eventDetail
    const jumpWorld = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    this._jump(enabledElement, jumpWorld)

    const annotations = getAnnotations(element, CrosshairsTool.toolName)
    const filteredAnnotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      annotations
    )

    // viewport Annotation
    const { data } = filteredAnnotations[0]

    const { rotationPoints } = data.handles
    const viewportUIDArray = []
    // put all the draggable reference lines in the viewportUIDArray
    for (let i = 0; i < rotationPoints.length - 1; ++i) {
      const otherViewport = rotationPoints[i][1]
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      const viewportDraggableRotatable =
        this._getReferenceLineDraggableRotatable(otherViewport.uid)
      if (!viewportControllable || !viewportDraggableRotatable) {
        continue
      }
      viewportUIDArray.push(otherViewport.uid)
      // rotation handles are two per viewport
      i++
    }

    data.activeViewportUIDs = [...viewportUIDArray]
    // set translation operation
    data.handles.activeOperation = OPERATION.DRAG

    evt.preventDefault()

    hideElementCursor(element)

    this._activateModify(element)
    return filteredAnnotations[0]
  }

  cancel = () => {
    console.log('Not implemented yet')
  }

  /**
   * It checks if the mouse click is near crosshairs handles, if yes
   * it returns the handle location. If the mouse click is not near any
   * of the handles, it does not return anything.
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
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    let point = this._getRotationHandleNearImagePoint(
      viewport,
      annotation,
      canvasCoords,
      proximity
    )

    if (point !== null) {
      return point
    }

    point = this._getSlabThicknessHandleNearImagePoint(
      viewport,
      annotation,
      canvasCoords,
      proximity
    )

    if (point !== null) {
      return point
    }
  }

  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    annotation.highlighted = true

    // NOTE: handle index or coordinates are not used when dragging.
    // This because the handle points are actually generated in the renderTool and they are a derivative
    // from the camera variables of the viewports and of the slab thickness variable.
    // Remember that the translation and rotation operations operate on the camera
    // variables and not really on the handles. Similar for the slab thickness.
    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()
  }

  /**
   * It returns if the canvas point is near the provided crosshairs annotation in the
   * provided element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLElement,
    annotation: CrosshairsAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    if (this._pointNearTool(element, annotation, canvasCoords, 6)) {
      return true
    }

    return false
  }

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail
    const { element } = eventDetail
    annotation.highlighted = true

    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()
  }

  onCameraModified = (evt) => {
    const eventDetail = evt.detail
    const { element } = eventDetail
    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement
    const viewport = enabledElement.viewport as Types.IVolumeViewport

    const requireSameOrientation = false
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      CrosshairsTool.toolName,
      requireSameOrientation
    )

    const annotations = getAnnotations(element, CrosshairsTool.toolName)
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations)

    // viewport Annotation
    const viewportAnnotation =
      filteredToolAnnotations[0] as CrosshairsAnnotation

    if (!viewportAnnotation) {
      return
    }

    // -- Update the camera of other linked viewports containing the same volumeUID that
    //    have the same camera in case of translation
    // -- Update the crosshair center in world coordinates in annotation.
    // This is necessary because other tools can modify the position of the slices,
    // e.g. stackscroll tool at wheel scroll. So we update the coordinates of the center always here.
    // NOTE: rotation and slab thickness handles are created/updated in renderTool.
    const currentCamera = viewport.getCamera()
    const oldCameraPosition = viewportAnnotation.metadata.cameraPosition
    const deltaCameraPosition: Types.Point3 = [0, 0, 0]
    vtkMath.subtract(
      currentCamera.position,
      oldCameraPosition,
      deltaCameraPosition
    )

    const oldCameraFocalPoint = viewportAnnotation.metadata.cameraFocalPoint
    const deltaCameraFocalPoint: Types.Point3 = [0, 0, 0]
    vtkMath.subtract(
      currentCamera.focalPoint,
      oldCameraFocalPoint,
      deltaCameraFocalPoint
    )

    // updated cached "previous" camera position and focal point
    viewportAnnotation.metadata.cameraPosition = [...currentCamera.position]
    viewportAnnotation.metadata.cameraFocalPoint = [...currentCamera.focalPoint]

    const viewportControllable = this._getReferenceLineControllable(
      viewport.uid
    )
    const viewportDraggableRotatable = this._getReferenceLineDraggableRotatable(
      viewport.uid
    )
    if (
      !csUtils.isEqual(currentCamera.position, oldCameraPosition, 1e-3) &&
      viewportControllable &&
      viewportDraggableRotatable
    ) {
      // Is camera Modified a TRANSLATION or ROTATION?
      let IsTranslation = true

      // NOTE: it is a translation if the the focal point and camera position shifts are the same
      if (!csUtils.isEqual(deltaCameraPosition, deltaCameraFocalPoint, 1e-3)) {
        IsTranslation = false
      }

      // TRANSLATION
      // NOTE1: if it's a panning don't update the crosshair center
      // NOTE2: rotation handles are updates in renderTool
      // panning check is:
      // -- deltaCameraPosition dot viewPlaneNormal > 1e-2
      if (
        IsTranslation &&
        Math.abs(
          vtkMath.dot(deltaCameraPosition, currentCamera.viewPlaneNormal)
        ) > 1e-2
      ) {
        // update linked view in the same scene that have the same camera
        // this goes here, because the parent viewport translation may happen in another tool
        // const otherLinkedViewportsAnnotationsWithSameCameraDirection =
        //   this._filterLinkedViewportWithSameOrientationAndScene(
        //     enabledElement,
        //     annotations
        //   )

        // for (
        //   let i = 0;
        //   i < otherLinkedViewportsAnnotationsWithSameCameraDirection.length;
        //   ++i
        // ) {
        //   const annotation =
        //     otherLinkedViewportsAnnotationsWithSameCameraDirection[i]
        //   const { data } = annotation
        //   const scene = renderingEngine.getScene(data.sceneUID)
        //   const otherViewport = scene.getViewport(data.viewportUID)
        //   const camera = otherViewport.getCamera()

        //   const newFocalPoint = [0, 0, 0]
        //   const newPosition = [0, 0, 0]

        //   vtkMath.add(camera.focalPoint, deltaCameraPosition, newFocalPoint)
        //   vtkMath.add(camera.position, deltaCameraPosition, newPosition)

        //   // updated cached "previous" camera position and focal point
        //   annotation.metadata.cameraPosition = [...currentCamera.position]
        //   annotation.metadata.cameraFocalPoint = [...currentCamera.focalPoint]
        // }

        // update center of the crosshair
        this.toolCenter[0] += deltaCameraPosition[0]
        this.toolCenter[1] += deltaCameraPosition[1]
        this.toolCenter[2] += deltaCameraPosition[2]
      }
    }

    // AutoPan modification
    if (this.configuration.autoPan.enabled) {
      const viewports = csUtils.getVolumeViewportsContainingSameVolumes(
        viewport,
        renderingEngine.uid
      )

      viewports.forEach(({ uid: viewportUID }) => {
        // other viewports in the scene
        if (viewportUID !== viewport.uid) {
          this._autoPanViewportIfNecessary(viewportUID, renderingEngine)
        }
      })
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredToolAnnotations: Annotations
  ): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let imageNeedsUpdate = false

    for (let i = 0; i < filteredToolAnnotations.length; i++) {
      const annotation = filteredToolAnnotations[i] as CrosshairsAnnotation

      if (isAnnotationLocked(annotation)) {
        continue
      }

      const { data, highlighted } = annotation
      if (!data.handles) {
        continue
      }

      const previousActiveOperation = data.handles.activeOperation
      const previousActiveViewportUIDs =
        data.activeViewportUIDs && data.activeViewportUIDs.length > 0
          ? [...data.activeViewportUIDs]
          : []

      // This init are necessary, because when we move the mouse they are not cleaned by _mouseUpCallback
      data.activeViewportUIDs = []
      data.handles.activeOperation = null

      const handleNearImagePoint = this.getHandleNearImagePoint(
        element,
        annotation,
        canvasCoords,
        6
      )

      let near = false
      if (handleNearImagePoint) {
        near = true
      } else {
        near = this._pointNearTool(element, annotation, canvasCoords, 6)
      }

      const nearToolAndNotMarkedActive = near && !highlighted
      const notNearToolAndMarkedActive = !near && highlighted
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        annotation.highlighted = !highlighted
        imageNeedsUpdate = true
      } else if (
        data.handles.activeOperation !== previousActiveOperation ||
        !this._areViewportUIDArraysEqual(
          data.activeViewportUIDs,
          previousActiveViewportUIDs
        )
      ) {
        imageNeedsUpdate = true
      }
    }

    return imageNeedsUpdate
  }

  filterInteractableAnnotationsForElement = (element, annotations) => {
    if (!annotations || !annotations.length) {
      return []
    }

    const enabledElement = getEnabledElement(element)
    const { viewportUID } = enabledElement

    const viewportUIDSpecificCrosshairs = annotations.filter(
      (annotation) => annotation.data.viewportUID === viewportUID
    )

    return viewportUIDSpecificCrosshairs
  }

  /**
   * renders the crosshairs lines and handles in the requestAnimationFrame callback
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    const { viewport, renderingEngine } = enabledElement
    const { element } = viewport
    const annotations = getAnnotations(element, CrosshairsTool.toolName)
    const camera = viewport.getCamera()

    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations)

    // viewport Annotation
    const viewportAnnotation = filteredToolAnnotations[0]
    if (!annotations || !viewportAnnotation || !viewportAnnotation.data) {
      // No annotations yet, and didn't just create it as we likely don't have a FrameOfReference/any data loaded yet.
      return
    }

    const annotationUID = viewportAnnotation.annotationUID

    // Get cameras/canvases for each of these.
    // -- Get two world positions for this canvas in this line (e.g. the diagonal)
    // -- Convert these world positions to this canvas.
    // -- Extend/confine this line to fit in this canvas.
    // -- Render this line.

    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)

    const data = viewportAnnotation.data
    const crosshairCenterCanvas = viewport.worldToCanvas(this.toolCenter)

    const otherViewportAnnotations =
      this._filterAnnotationsByUniqueViewportOrientations(
        enabledElement,
        annotations
      )

    const referenceLines = []

    otherViewportAnnotations.forEach((annotation) => {
      const { data } = annotation

      data.handles.toolCenter = this.toolCenter

      const otherViewport = renderingEngine.getViewport(
        data.viewportUID
      ) as Types.IVolumeViewport

      const otherCamera = otherViewport.getCamera()

      const otherViewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      const otherViewportDraggableRotatable =
        this._getReferenceLineDraggableRotatable(otherViewport.uid)
      const otherViewportSlabThicknessControlsOn =
        this._getReferenceLineSlabThicknessControlsOn(otherViewport.uid)

      // get coordinates for the reference line
      const { sWidth, sHeight } = otherViewport
      const otherCanvasDiagonalLength = Math.sqrt(
        sWidth * sWidth + sHeight * sHeight
      )
      const otherCanvasCenter: Types.Point2 = [sWidth * 0.5, sHeight * 0.5]
      const otherViewportCenterWorld =
        otherViewport.canvasToWorld(otherCanvasCenter)

      const direction: Types.Point3 = [0, 0, 0]
      vtkMath.cross(
        camera.viewPlaneNormal,
        otherCamera.viewPlaneNormal,
        direction
      )
      vtkMath.normalize(direction)
      vtkMath.multiplyScalar(<Types.Point3>direction, otherCanvasDiagonalLength)

      const pointWorld0: Types.Point3 = [0, 0, 0]
      vtkMath.add(otherViewportCenterWorld, direction, pointWorld0)

      const pointWorld1: Types.Point3 = [0, 0, 0]
      vtkMath.subtract(otherViewportCenterWorld, direction, pointWorld1)

      // get canvas information for points and lines (canvas box, canvas horizontal distances)
      const canvasBox = [0, 0, sWidth, sHeight]

      const pointCanvas0 = viewport.worldToCanvas(pointWorld0)

      const otherViewportCenterCanvas = viewport.worldToCanvas(
        otherViewportCenterWorld
      )

      const canvasUnitVectorFromCenter = vec2.create()
      vec2.subtract(
        canvasUnitVectorFromCenter,
        pointCanvas0,
        otherViewportCenterCanvas
      )
      vec2.normalize(canvasUnitVectorFromCenter, canvasUnitVectorFromCenter)

      // Graphic:
      // Mid -> SlabThickness handle
      // Short -> Rotation handle
      //                           Long
      //                            |
      //                            |
      //                            |
      //                           Mid
      //                            |
      //                            |
      //                            |
      //                          Short
      //                            |
      //                            |
      //                            |
      // Long --- Mid--- Short--- Center --- Short --- Mid --- Long
      //                            |
      //                            |
      //                            |
      //                          Short
      //                            |
      //                            |
      //                            |
      //                           Mid
      //                            |
      //                            |
      //                            |
      //                           Long
      const canvasVectorFromCenterLong = vec2.create()

      // Todo: configuration should provide constants below (100, 0.25, 0.15, 0.04)
      vec2.scale(
        canvasVectorFromCenterLong,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 100
      )
      const canvasVectorFromCenterMid = vec2.create()
      vec2.scale(
        canvasVectorFromCenterMid,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 0.25
      )
      const canvasVectorFromCenterShort = vec2.create()
      vec2.scale(
        canvasVectorFromCenterShort,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 0.15
      )
      const canvasVectorFromCenterStart = vec2.create()
      vec2.scale(
        canvasVectorFromCenterStart,
        canvasUnitVectorFromCenter,
        // Don't put a gap if the the third view is missing
        otherViewportAnnotations.length === 2 ? canvasDiagonalLength * 0.04 : 0
      )

      // Computing Reference start and end (4 lines per viewport in case of 3 view MPR)
      const refLinePointOne = vec2.create()
      const refLinePointTwo = vec2.create()
      const refLinePointThree = vec2.create()
      const refLinePointFour = vec2.create()

      let refLinesCenter = vec2.clone(crosshairCenterCanvas)
      if (!otherViewportDraggableRotatable || !otherViewportControllable) {
        refLinesCenter = vec2.clone(otherViewportCenterCanvas)
      }

      vec2.add(refLinePointOne, refLinesCenter, canvasVectorFromCenterStart)
      vec2.add(refLinePointTwo, refLinesCenter, canvasVectorFromCenterLong)
      vec2.subtract(
        refLinePointThree,
        refLinesCenter,
        canvasVectorFromCenterStart
      )
      vec2.subtract(
        refLinePointFour,
        refLinesCenter,
        canvasVectorFromCenterLong
      )

      // Clipping lines to be only included in a box (canvas), we don't want
      // the lines goes beyond canvas
      liangBarksyClip(refLinePointOne, refLinePointTwo, canvasBox)
      liangBarksyClip(refLinePointThree, refLinePointFour, canvasBox)

      // Computing rotation handle positions
      const rotHandleOne = vec2.create()
      vec2.subtract(
        rotHandleOne,
        crosshairCenterCanvas,
        canvasVectorFromCenterMid
      )

      const rotHandleTwo = vec2.create()
      vec2.add(rotHandleTwo, crosshairCenterCanvas, canvasVectorFromCenterMid)

      // Computing SlabThickness (st below) position

      // SlabThickness center in canvas
      let stHandlesCenterCanvas = vec2.clone(crosshairCenterCanvas)
      if (
        !otherViewportDraggableRotatable &&
        otherViewportSlabThicknessControlsOn
      ) {
        stHandlesCenterCanvas = vec2.clone(otherViewportCenterCanvas)
      }

      // SlabThickness center in world
      let stHandlesCenterWorld: Types.Point3 = [...this.toolCenter]
      if (
        !otherViewportDraggableRotatable &&
        otherViewportSlabThicknessControlsOn
      ) {
        stHandlesCenterWorld = [...otherViewportCenterWorld]
      }

      const worldUnitVectorFromCenter: Types.Point3 = [0, 0, 0]
      vtkMath.subtract(pointWorld0, pointWorld1, worldUnitVectorFromCenter)
      vtkMath.normalize(worldUnitVectorFromCenter)

      const { viewPlaneNormal } = camera
      // @ts-ignore // Todo: fix after vtk pr merged
      const { matrix } = vtkMatrixBuilder
        .buildFromDegree()
        // @ts-ignore fix after vtk pr merged
        .rotate(90, viewPlaneNormal)

      const worldUnitOrthoVectorFromCenter: Types.Point3 = [0, 0, 0]
      vec3.transformMat4(
        worldUnitOrthoVectorFromCenter,
        worldUnitVectorFromCenter,
        matrix
      )

      const slabThicknessValue = otherViewport.getSlabThickness()
      const worldOrthoVectorFromCenter: Types.Point3 = [
        ...worldUnitOrthoVectorFromCenter,
      ]
      vtkMath.multiplyScalar(worldOrthoVectorFromCenter, slabThicknessValue)

      const worldVerticalRefPoint: Types.Point3 = [0, 0, 0]
      vtkMath.add(
        stHandlesCenterWorld,
        worldOrthoVectorFromCenter,
        worldVerticalRefPoint
      )

      // convert vertical world distances in canvas coordinates
      const canvasVerticalRefPoint = viewport.worldToCanvas(
        worldVerticalRefPoint
      )

      // points for slab thickness lines
      const canvasOrthoVectorFromCenter = vec2.create()
      vec2.subtract(
        canvasOrthoVectorFromCenter,
        stHandlesCenterCanvas,
        canvasVerticalRefPoint
      )

      const stLinePointOne = vec2.create()
      vec2.subtract(
        stLinePointOne,
        stHandlesCenterCanvas,
        canvasVectorFromCenterLong
      )
      vec2.add(stLinePointOne, stLinePointOne, canvasOrthoVectorFromCenter)

      const stLinePointTwo = vec2.create()
      vec2.add(
        stLinePointTwo,
        stHandlesCenterCanvas,
        canvasVectorFromCenterLong
      )
      vec2.add(stLinePointTwo, stLinePointTwo, canvasOrthoVectorFromCenter)

      liangBarksyClip(stLinePointOne, stLinePointTwo, canvasBox)

      const stLinePointThree = vec2.create()
      vec2.add(
        stLinePointThree,
        stHandlesCenterCanvas,
        canvasVectorFromCenterLong
      )
      vec2.subtract(
        stLinePointThree,
        stLinePointThree,
        canvasOrthoVectorFromCenter
      )

      const stLinePointFour = vec2.create()
      vec2.subtract(
        stLinePointFour,
        stHandlesCenterCanvas,
        canvasVectorFromCenterLong
      )
      vec2.subtract(
        stLinePointFour,
        stLinePointFour,
        canvasOrthoVectorFromCenter
      )

      liangBarksyClip(stLinePointThree, stLinePointFour, canvasBox)

      // points for slab thickness handles
      const stHandleOne = vec2.create()
      const stHandleTwo = vec2.create()
      const stHandleThree = vec2.create()
      const stHandleFour = vec2.create()

      vec2.subtract(
        stHandleOne,
        stHandlesCenterCanvas,
        canvasVectorFromCenterShort
      )
      vec2.add(stHandleOne, stHandleOne, canvasOrthoVectorFromCenter)
      vec2.add(stHandleTwo, stHandlesCenterCanvas, canvasVectorFromCenterShort)
      vec2.add(stHandleTwo, stHandleTwo, canvasOrthoVectorFromCenter)
      vec2.subtract(
        stHandleThree,
        stHandlesCenterCanvas,
        canvasVectorFromCenterShort
      )
      vec2.subtract(stHandleThree, stHandleThree, canvasOrthoVectorFromCenter)
      vec2.add(stHandleFour, stHandlesCenterCanvas, canvasVectorFromCenterShort)
      vec2.subtract(stHandleFour, stHandleFour, canvasOrthoVectorFromCenter)

      referenceLines.push([
        otherViewport,
        refLinePointOne,
        refLinePointTwo,
        refLinePointThree,
        refLinePointFour,
        stLinePointOne,
        stLinePointTwo,
        stLinePointThree,
        stLinePointFour,
        rotHandleOne,
        rotHandleTwo,
        stHandleOne,
        stHandleTwo,
        stHandleThree,
        stHandleFour,
      ])
    })

    const newRtpoints = []
    const newStpoints = []
    const viewportColor = this._getReferenceLineColor(viewport.uid)
    const color =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'

    referenceLines.forEach((line, lineIndex) => {
      // get color for the reference line
      const otherViewport = line[0]
      const viewportColor = this._getReferenceLineColor(otherViewport.uid)
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      const viewportDraggableRotatable =
        this._getReferenceLineDraggableRotatable(otherViewport.uid)
      const viewportSlabThicknessControlsOn =
        this._getReferenceLineSlabThicknessControlsOn(otherViewport.uid)
      const selectedViewportUID = data.activeViewportUIDs.find(
        (uid) => uid === otherViewport.uid
      )

      let color =
        viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'
      let lineWidth = 1
      const lineActive =
        data.handles.activeOperation !== null &&
        data.handles.activeOperation === OPERATION.DRAG &&
        selectedViewportUID

      if (lineActive) {
        lineWidth = 2.5
      }

      let lineUID = `${lineIndex}`
      if (viewportControllable && viewportDraggableRotatable) {
        lineUID = `${lineIndex}One`
        drawLineSvg(
          svgDrawingHelper,
          CrosshairsTool.toolName,
          annotationUID,
          lineUID,
          line[1],
          line[2],
          {
            color,
            lineWidth,
          }
        )

        lineUID = `${lineIndex}Two`
        drawLineSvg(
          svgDrawingHelper,
          CrosshairsTool.toolName,
          annotationUID,
          lineUID,
          line[3],
          line[4],
          {
            color,
            lineWidth,
          }
        )
      } else {
        drawLineSvg(
          svgDrawingHelper,
          CrosshairsTool.toolName,
          annotationUID,
          lineUID,
          line[2],
          line[4],
          {
            color,
            lineWidth,
          }
        )
      }

      if (viewportControllable) {
        color =
          viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'

        const rotHandlesActive =
          data.handles.activeOperation === OPERATION.ROTATE
        const rotationHandles = [line[9], line[10]]

        const rotHandleWorldOne = [
          viewport.canvasToWorld(line[9]),
          otherViewport,
          line[1],
          line[2],
        ]
        const rotHandleWorldTwo = [
          viewport.canvasToWorld(line[10]),
          otherViewport,
          line[3],
          line[4],
        ]
        newRtpoints.push(rotHandleWorldOne, rotHandleWorldTwo)

        const slabThicknessHandlesActive =
          data.handles.activeOperation === OPERATION.SLAB
        const slabThicknessHandles = [line[11], line[12], line[13], line[14]]

        const slabThicknessHandleWorldOne = [
          viewport.canvasToWorld(line[11]),
          otherViewport,
          line[5],
          line[6],
        ]
        const slabThicknessHandleWorldTwo = [
          viewport.canvasToWorld(line[12]),
          otherViewport,
          line[5],
          line[6],
        ]
        const slabThicknessHandleWorldThree = [
          viewport.canvasToWorld(line[13]),
          otherViewport,
          line[7],
          line[8],
        ]
        const slabThicknessHandleWorldFour = [
          viewport.canvasToWorld(line[14]),
          otherViewport,
          line[7],
          line[8],
        ]
        newStpoints.push(
          slabThicknessHandleWorldOne,
          slabThicknessHandleWorldTwo,
          slabThicknessHandleWorldThree,
          slabThicknessHandleWorldFour
        )

        if (
          lineActive &&
          !rotHandlesActive &&
          !slabThicknessHandlesActive &&
          viewportDraggableRotatable &&
          viewportSlabThicknessControlsOn
        ) {
          // draw all handles inactive (rotation and slab thickness)
          let handleUID = `${lineIndex}One`
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            handleUID,
            rotationHandles,
            {
              color,
              handleRadius: 3,
              type: 'circle',
            }
          )
          handleUID = `${lineIndex}Two`
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            handleUID,
            slabThicknessHandles,
            {
              color,
              handleRadius: 3,
              type: 'rect',
            }
          )
        } else if (
          lineActive &&
          !rotHandlesActive &&
          !slabThicknessHandlesActive &&
          viewportDraggableRotatable
        ) {
          const handleUID = `${lineIndex}`
          // draw rotation handles inactive
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            handleUID,
            rotationHandles,
            {
              color,
              handleRadius: 3,
              type: 'circle',
            }
          )
        } else if (
          selectedViewportUID &&
          !rotHandlesActive &&
          !slabThicknessHandlesActive &&
          viewportSlabThicknessControlsOn
        ) {
          const handleUID = `${lineIndex}`
          // draw slab thickness handles inactive
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            handleUID,
            slabThicknessHandles,
            {
              color,
              handleRadius: 3,
              type: 'rect',
            }
          )
        } else if (rotHandlesActive && viewportDraggableRotatable) {
          const handleUID = `${lineIndex}`
          // draw all rotation handles as active
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            handleUID,
            rotationHandles,
            {
              color,
              handleRadius: 2,
              fill: color,
              type: 'circle',
            }
          )
        } else if (
          slabThicknessHandlesActive &&
          selectedViewportUID &&
          viewportSlabThicknessControlsOn
        ) {
          // draw only the slab thickness handles for the active viewport as active
          drawHandlesSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            lineUID,
            slabThicknessHandles,
            {
              color,
              handleRadius: 2,
              fill: color,
              type: 'rect',
            }
          )
        }
        const slabThicknessValue = otherViewport.getSlabThickness()
        if (slabThicknessValue > 0.5 && viewportSlabThicknessControlsOn) {
          // draw slab thickness reference lines
          lineUID = `${lineIndex}STOne`
          drawLineSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            lineUID,
            line[5],
            line[6],
            {
              color,
              width: 1,
              lineDash: [2, 3],
            }
          )

          lineUID = `${lineIndex}STTwo`
          drawLineSvg(
            svgDrawingHelper,
            CrosshairsTool.toolName,
            annotationUID,
            lineUID,
            line[7],
            line[8],
            {
              color,
              width: line,
              lineDash: [2, 3],
            }
          )
        }
      }
    })

    // Save new handles points in annotation
    data.handles.rotationPoints = newRtpoints
    data.handles.slabThicknessPoints = newStpoints

    // render a circle to pin point the viewport color
    // TODO: This should not be part of the tool, and definitely not part of the renderAnnotation loop
    const referenceColorCoordinates = [
      sWidth * 0.95,
      sHeight * 0.05,
    ] as Types.Point2
    const circleRadius = canvasDiagonalLength * 0.01

    const circleUID = '0'
    drawCircleSvg(
      svgDrawingHelper,
      CrosshairsTool.toolName,
      annotationUID,
      circleUID,
      referenceColorCoordinates,
      circleRadius,
      { color, fill: color }
    )
  }

  _autoPanViewportIfNecessary(
    viewportUID: string,
    renderingEngine: Types.IRenderingEngine
  ): void {
    // 1. Compute the current world bounding box of the viewport from corner to corner
    // 2. Check if the toolCenter is outside of the world bounding box
    // 3. If it is outside, pan the viewport to fit in the toolCenter

    const viewport = renderingEngine.getViewport(viewportUID)
    const { sWidth, sHeight } = viewport

    const topLefWorld = viewport.canvasToWorld([0, 0])
    const bottomRightWorld = viewport.canvasToWorld([sWidth, sHeight])
    const topRightWorld = viewport.canvasToWorld([sWidth, 0])
    const bottomLeftWorld = viewport.canvasToWorld([0, sHeight])

    // find the minimum and maximum world coordinates in each x,y,z
    const minX = Math.min(
      topLefWorld[0],
      bottomRightWorld[0],
      topRightWorld[0],
      bottomLeftWorld[0]
    )
    const maxX = Math.max(
      topLefWorld[0],
      bottomRightWorld[0],
      topRightWorld[0],
      bottomLeftWorld[0]
    )
    const minY = Math.min(
      topLefWorld[1],
      bottomRightWorld[1],
      topRightWorld[1],
      bottomLeftWorld[1]
    )
    const maxY = Math.max(
      topLefWorld[1],
      bottomRightWorld[1],
      topRightWorld[1],
      bottomLeftWorld[1]
    )
    const minZ = Math.min(
      topLefWorld[2],
      bottomRightWorld[2],
      topRightWorld[2],
      bottomLeftWorld[2]
    )
    const maxZ = Math.max(
      topLefWorld[2],
      bottomRightWorld[2],
      topRightWorld[2],
      bottomLeftWorld[2]
    )

    // pan the viewport to fit the toolCenter in the direction
    // that is out of bounds
    let deltaPointsWorld
    const pan = this.configuration.autoPan.panSize

    if (this.toolCenter[0] < minX - EPSILON) {
      deltaPointsWorld = [minX - this.toolCenter[0] + pan, 0, 0]
    } else if (this.toolCenter[0] > maxX + EPSILON) {
      deltaPointsWorld = [maxX - this.toolCenter[0] - pan, 0, 0]
    } else if (this.toolCenter[1] < minY - EPSILON) {
      deltaPointsWorld = [0, minY - this.toolCenter[1] + pan, 0]
    } else if (this.toolCenter[1] > maxY + EPSILON) {
      deltaPointsWorld = [0, maxY - this.toolCenter[1] - pan, 0]
    } else if (this.toolCenter[2] < minZ - EPSILON) {
      deltaPointsWorld = [0, 0, minZ - this.toolCenter[2] + pan]
    } else if (this.toolCenter[2] > maxZ + EPSILON) {
      deltaPointsWorld = [0, 0, maxZ - this.toolCenter[2] - pan]
    } else {
      return
    }

    const camera = viewport.getCamera()
    const { focalPoint, position } = camera

    const updatedPosition = <Types.Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ]

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ]

    viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    })

    viewport.render()
  }

  _areViewportUIDArraysEqual = (viewportUIDArrayOne, viewportUIDArrayTwo) => {
    if (viewportUIDArrayOne.length !== viewportUIDArrayTwo.length) {
      return false
    }

    viewportUIDArrayOne.forEach((uid) => {
      let itemFound = false
      for (let i = 0; i < viewportUIDArrayTwo.length; ++i) {
        if (uid === viewportUIDArrayTwo[i]) {
          itemFound = true
          break
        }
      }
      if (itemFound === false) {
        return false
      }
    })

    return true
  }

  // It filters the viewports with crosshairs and only return viewports
  // that have different camera.
  _getAnnotationsForViewportsWithDifferentCameras = (
    enabledElement,
    annotations
  ) => {
    const { viewportUID, renderingEngine, viewport } = enabledElement

    const otherViewportAnnotations = annotations.filter(
      (annotation) => annotation.data.viewportUID !== viewportUID
    )

    if (!otherViewportAnnotations || !otherViewportAnnotations.length) {
      return []
    }

    const camera = viewport.getCamera()
    const { viewPlaneNormal, position } = camera

    const viewportsWithDifferentCameras = otherViewportAnnotations.filter(
      (annotation) => {
        const { viewportUID } = annotation.data
        const targetViewport = renderingEngine.getViewport(viewportUID)
        const cameraOfTarget = targetViewport.getCamera()

        return !(
          csUtils.isEqual(
            cameraOfTarget.viewPlaneNormal,
            viewPlaneNormal,
            1e-2
          ) && csUtils.isEqual(cameraOfTarget.position, position, 1)
        )
      }
    )

    return viewportsWithDifferentCameras
  }

  _filterLinkedViewportWithSameOrientationAndScene = (
    enabledElement,
    annotations
  ) => {
    const { renderingEngine, viewport } = enabledElement
    const viewportControllable = this._getReferenceLineControllable(
      viewport.uid
    )

    const otherLinkedViewportAnnotationsFromSameScene = annotations.filter(
      (annotation) => {
        const { data } = annotation
        const otherViewport = renderingEngine.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          // scene === otherScene &&
          otherViewportControllable === true &&
          viewportControllable === true
        )
      }
    )

    if (
      !otherLinkedViewportAnnotationsFromSameScene ||
      !otherLinkedViewportAnnotationsFromSameScene.length
    ) {
      return []
    }

    const camera = viewport.getCamera()
    const viewPlaneNormal = camera.viewPlaneNormal
    vtkMath.normalize(viewPlaneNormal)

    const otherLinkedViewportsAnnotationsWithSameCameraDirection =
      otherLinkedViewportAnnotationsFromSameScene.filter((annotation) => {
        const { viewportUID } = annotation.data
        const otherViewport = renderingEngine.getViewport(viewportUID)
        const otherCamera = otherViewport.getCamera()
        const otherViewPlaneNormal = otherCamera.viewPlaneNormal
        vtkMath.normalize(otherViewPlaneNormal)

        return (
          csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) &&
          csUtils.isEqual(camera.viewUp, otherCamera.viewUp, 1e-2)
        )
      })

    return otherLinkedViewportsAnnotationsWithSameCameraDirection
  }

  _filterAnnotationsByUniqueViewportOrientations = (
    enabledElement,
    annotations
  ) => {
    const { renderingEngine, viewport } = enabledElement
    const camera = viewport.getCamera()
    const viewPlaneNormal = camera.viewPlaneNormal
    vtkMath.normalize(viewPlaneNormal)

    const otherLinkedViewportAnnotationsFromSameScene = annotations.filter(
      (annotation) => {
        const { data } = annotation
        const otherViewport = renderingEngine.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          // scene === otherScene &&
          otherViewportControllable === true
        )
      }
    )

    const otherViewportsAnnotationsWithUniqueCameras = []
    // Iterate first on other viewport from the same scene linked
    for (
      let i = 0;
      i < otherLinkedViewportAnnotationsFromSameScene.length;
      ++i
    ) {
      const annotation = otherLinkedViewportAnnotationsFromSameScene[i]
      const { viewportUID } = annotation.data
      const otherViewport = renderingEngine.getViewport(viewportUID)
      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj]
        const { viewportUID } = annotation.data
        const stockedViewport = renderingEngine.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation)
      }
    }

    const otherNonLinkedViewportAnnotationsFromSameScene = annotations.filter(
      (annotation) => {
        const { data } = annotation
        const otherViewport = renderingEngine.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          // scene === otherScene &&
          otherViewportControllable !== true
        )
      }
    )

    // Iterate second on other viewport from the same scene non linked
    for (
      let i = 0;
      i < otherNonLinkedViewportAnnotationsFromSameScene.length;
      ++i
    ) {
      const annotation = otherNonLinkedViewportAnnotationsFromSameScene[i]
      const { viewportUID } = annotation.data
      const otherViewport = renderingEngine.getViewport(viewportUID)

      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj]
        const { viewportUID } = annotation.data
        const stockedViewport = renderingEngine.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation)
      }
    }

    // Iterate on all the viewport
    const otherViewportAnnotations =
      this._getAnnotationsForViewportsWithDifferentCameras(
        enabledElement,
        annotations
      )

    for (let i = 0; i < otherViewportAnnotations.length; ++i) {
      const annotation = otherViewportAnnotations[i]
      if (
        otherViewportsAnnotationsWithUniqueCameras.find(
          (element) => element === annotation
        ) === true
      ) {
        continue
      }

      const { viewportUID } = annotation.data
      const otherViewport = renderingEngine.getViewport(viewportUID)
      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj]
        const { viewportUID } = annotation.data
        const stockedViewport = renderingEngine.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation)
      }
    }

    return otherViewportsAnnotationsWithUniqueCameras
  }

  _checkIfViewportsRenderingSameScene = (viewport, otherViewport) => {
    const actors = viewport.getActors()
    const otherViewportActors = otherViewport.getActors()

    let sameScene = true

    actors.forEach((actor) => {
      if (
        actors.length !== otherViewportActors.length ||
        otherViewportActors.find(({ uid }) => uid === actor.uid) === undefined
      ) {
        sameScene = false
      }
    })

    return sameScene
  }

  _jump = (enabledElement, jumpWorld) => {
    state.isInteractingWithTool = true
    const { viewport, renderingEngine } = enabledElement

    const annotations = getAnnotations(
      viewport.element,
      CrosshairsTool.toolName
    )

    const delta: Types.Point3 = [0, 0, 0]
    vtkMath.subtract(jumpWorld, this.toolCenter, delta)

    // TRANSLATION
    // get the annotation of the other viewport which are parallel to the delta shift and are of the same scene
    const otherViewportAnnotations =
      this._getAnnotationsForViewportsWithDifferentCameras(
        enabledElement,
        annotations
      )

    const viewportsAnnotationsToUpdate = otherViewportAnnotations.filter(
      (annotation) => {
        const { data } = annotation
        const otherViewport = renderingEngine.getViewport(data.viewportUID)

        const sameScene = this._checkIfViewportsRenderingSameScene(
          viewport,
          otherViewport
        )

        return (
          this._getReferenceLineControllable(otherViewport.uid) &&
          this._getReferenceLineDraggableRotatable(otherViewport.uid) &&
          sameScene
        )
      }
    )

    if (viewportsAnnotationsToUpdate.length === 0) {
      state.isInteractingWithTool = false
      return false
    }

    this._applyDeltaShiftToSelectedViewportCameras(
      renderingEngine,
      viewportsAnnotationsToUpdate,
      delta
    )

    state.isInteractingWithTool = false

    return true
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

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    this.editData.annotation.highlighted = false
    this.editData.annotation.data.handles.activeOperation = null
    this.editData.annotation.data.activeViewportUIDs = []

    this._deactivateModify(element)

    resetElementCursor(element)

    this.editData = null

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    const requireSameOrientation = false
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      CrosshairsTool.toolName,
      requireSameOrientation
    )

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragCallback = (evt: MouseDragEventType) => {
    const eventDetail = evt.detail
    const delta = eventDetail.deltaPoints.world

    if (
      Math.abs(delta[0]) < 1e-3 &&
      Math.abs(delta[1]) < 1e-3 &&
      Math.abs(delta[2]) < 1e-3
    ) {
      return
    }

    const { element } = eventDetail
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const annotations = getAnnotations(
      element,
      CrosshairsTool.toolName
    ) as CrosshairsAnnotation[]
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations)

    // viewport Annotation
    const viewportAnnotation = filteredToolAnnotations[0]
    if (!viewportAnnotation) {
      return
    }

    const { handles } = viewportAnnotation.data
    const { currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas

    if (handles.activeOperation === OPERATION.DRAG) {
      // TRANSLATION
      // get the annotation of the other viewport which are parallel to the delta shift and are of the same scene
      const otherViewportAnnotations =
        this._getAnnotationsForViewportsWithDifferentCameras(
          enabledElement,
          annotations
        )

      const viewportsAnnotationsToUpdate = otherViewportAnnotations.filter(
        (annotation) => {
          const { data } = annotation
          const otherViewport = renderingEngine.getViewport(data.viewportUID)

          return viewportAnnotation.data.activeViewportUIDs.find(
            (uid) => uid === otherViewport.uid
          )
        }
      )

      this._applyDeltaShiftToSelectedViewportCameras(
        renderingEngine,
        viewportsAnnotationsToUpdate,
        delta
      )
    } else if (handles.activeOperation === OPERATION.ROTATE) {
      // ROTATION
      const otherViewportAnnotations =
        this._getAnnotationsForViewportsWithDifferentCameras(
          enabledElement,
          annotations
        )

      const viewportsAnnotationsToUpdate = otherViewportAnnotations.filter(
        (annotation) => {
          const { data } = annotation
          data.handles.toolCenter = center
          const otherViewport = renderingEngine.getViewport(data.viewportUID)
          const otherViewportControllable = this._getReferenceLineControllable(
            otherViewport.uid
          )
          const otherViewportRotatable =
            this._getReferenceLineDraggableRotatable(otherViewport.uid)

          return (
            // scene === otherScene &&
            otherViewportControllable === true &&
            otherViewportRotatable === true
          )
        }
      )

      const dir1 = vec2.create()
      const dir2 = vec2.create()

      const center: Types.Point3 = [
        this.toolCenter[0],
        this.toolCenter[1],
        this.toolCenter[2],
      ]

      const centerCanvas = viewport.worldToCanvas(center)

      const finalPointCanvas = eventDetail.currentPoints.canvas
      const originalPointCanvas = vec2.create()
      vec2.sub(
        originalPointCanvas,
        finalPointCanvas,
        eventDetail.deltaPoints.canvas
      )
      vec2.sub(dir1, originalPointCanvas, <vec2>centerCanvas)
      vec2.sub(dir2, finalPointCanvas, <vec2>centerCanvas)

      let angle = vec2.angle(dir1, dir2)

      if (
        this._isClockWise(centerCanvas, originalPointCanvas, finalPointCanvas)
      ) {
        angle *= -1
      }

      // Rounding the angle to allow rotated handles to be undone
      // If we don't round and rotate handles clockwise by 0.0131233 radians,
      // there's no assurance that the counter-clockwise rotation occurs at
      // precisely -0.0131233, resulting in the drawn annotations being lost.
      angle = Math.round(angle * 100) / 100

      const rotationAxis = viewport.getCamera().viewPlaneNormal
      // @ts-ignore : vtkjs incorrect typing
      const { matrix } = vtkMatrixBuilder
        .buildFromRadian()
        .translate(center[0], center[1], center[2])
        // @ts-ignore
        .rotate(angle, rotationAxis) //todo: why we are passing
        .translate(-center[0], -center[1], -center[2])

      const otherViewportsUIDs = []
      // update camera for the other viewports.
      // NOTE: The lines then are rendered by the onCameraModified
      viewportsAnnotationsToUpdate.forEach((annotation) => {
        const { data } = annotation
        data.handles.toolCenter = center

        const otherViewport = renderingEngine.getViewport(data.viewportUID)
        const camera = otherViewport.getCamera()
        const { viewUp, position, focalPoint } = camera

        viewUp[0] += position[0]
        viewUp[1] += position[1]
        viewUp[2] += position[2]

        vec3.transformMat4(focalPoint, focalPoint, matrix)
        vec3.transformMat4(position, position, matrix)
        vec3.transformMat4(viewUp, viewUp, matrix)

        viewUp[0] -= position[0]
        viewUp[1] -= position[1]
        viewUp[2] -= position[2]

        otherViewport.setCamera({
          position,
          viewUp,
          focalPoint,
        })
        otherViewportsUIDs.push(otherViewport.uid)
      })
      renderingEngine.renderViewports(otherViewportsUIDs)
    } else if (handles.activeOperation === OPERATION.SLAB) {
      // SLAB THICKNESS
      // this should be just the active one under the mouse,
      const viewportsAnnotationsToUpdate = annotations.filter(
        (annotation: CrosshairsAnnotation) => {
          const { data } = annotation
          const otherViewport = renderingEngine.getViewport(data.viewportUID)

          return viewportAnnotation.data.activeViewportUIDs.find(
            (uid) => uid === otherViewport.uid
          )
        }
      )

      viewportsAnnotationsToUpdate.forEach(
        (annotation: CrosshairsAnnotation) => {
          const { data } = annotation

          const otherViewport = renderingEngine.getViewport(
            data.viewportUID
          ) as Types.IVolumeViewport
          const camera = otherViewport.getCamera()
          const normal = camera.viewPlaneNormal

          const dotProd = vtkMath.dot(delta, normal)
          const projectedDelta: Types.Point3 = [...normal]
          vtkMath.multiplyScalar(projectedDelta, dotProd)

          if (
            Math.abs(projectedDelta[0]) > 1e-3 ||
            Math.abs(projectedDelta[1]) > 1e-3 ||
            Math.abs(projectedDelta[2]) > 1e-3
          ) {
            const mod = Math.sqrt(
              projectedDelta[0] * projectedDelta[0] +
                projectedDelta[1] * projectedDelta[1] +
                projectedDelta[2] * projectedDelta[2]
            )

            const currentPoint = eventDetail.lastPoints.world
            const direction: Types.Point3 = [0, 0, 0]

            const currentCenter: Types.Point3 = [
              this.toolCenter[0],
              this.toolCenter[1],
              this.toolCenter[2],
            ]

            // use this.toolCenter only if viewportDraggableRotatable
            const viewportDraggableRotatable =
              this._getReferenceLineDraggableRotatable(otherViewport.uid)
            if (!viewportDraggableRotatable) {
              const { rotationPoints } = this.editData.annotation.data.handles
              const otherViewportRotationPoints = rotationPoints.filter(
                (point) => point[1].uid === otherViewport.uid
              )
              if (otherViewportRotationPoints.length === 2) {
                const point1 = viewport.canvasToWorld(
                  otherViewportRotationPoints[0][3]
                )
                const point2 = viewport.canvasToWorld(
                  otherViewportRotationPoints[1][3]
                )
                vtkMath.add(point1, point2, currentCenter)
                vtkMath.multiplyScalar(<Types.Point3>currentCenter, 0.5)
              }
            }

            vtkMath.subtract(currentPoint, currentCenter, direction)
            const dotProdDirection = vtkMath.dot(direction, normal)
            const projectedDirection: Types.Point3 = [...normal]
            vtkMath.multiplyScalar(projectedDirection, dotProdDirection)
            const normalizedProjectedDirection: Types.Point3 = [
              projectedDirection[0],
              projectedDirection[1],
              projectedDirection[2],
            ]
            vec3.normalize(
              normalizedProjectedDirection,
              normalizedProjectedDirection
            )
            const normalizedProjectedDelta: Types.Point3 = [
              projectedDelta[0],
              projectedDelta[1],
              projectedDelta[2],
            ]
            vec3.normalize(normalizedProjectedDelta, normalizedProjectedDelta)

            let slabThicknessValue = otherViewport.getSlabThickness()
            if (
              csUtils.isOpposite(
                normalizedProjectedDirection,
                normalizedProjectedDelta,
                1e-3
              )
            ) {
              slabThicknessValue -= mod
            } else {
              slabThicknessValue += mod
            }

            slabThicknessValue = Math.abs(slabThicknessValue)
            slabThicknessValue = Math.max(0.1, slabThicknessValue)

            const near = this._pointNearReferenceLine(
              viewportAnnotation,
              canvasCoords,
              6,
              otherViewport
            )

            if (near) {
              otherViewport.setSlabThickness(null)
            } else {
              otherViewport.setSlabThickness(slabThicknessValue)
            }
            otherViewport.render()
          }
        }
      )
    }
  }

  _isClockWise(a, b, c) {
    // return true if the rotation is clockwise
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
  }

  _applyDeltaShiftToSelectedViewportCameras(
    renderingEngine,
    viewportsAnnotationsToUpdate,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    viewportsAnnotationsToUpdate.forEach((annotation) => {
      this._applyDeltaShiftToViewportCamera(renderingEngine, annotation, delta)
    })
  }
  _applyDeltaShiftToViewportCamera(
    renderingEngine: Types.IRenderingEngine,
    annotation,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    const { data } = annotation

    const viewport = renderingEngine.getViewport(data.viewportUID)
    const camera = viewport.getCamera()
    const normal = camera.viewPlaneNormal

    // Project delta over camera normal
    // (we don't need to pan, we need only to scroll the camera as in the wheel stack scroll tool)
    const dotProd = vtkMath.dot(delta, normal)
    const projectedDelta: Types.Point3 = [...normal]
    vtkMath.multiplyScalar(projectedDelta, dotProd)

    if (
      Math.abs(projectedDelta[0]) > 1e-3 ||
      Math.abs(projectedDelta[1]) > 1e-3 ||
      Math.abs(projectedDelta[2]) > 1e-3
    ) {
      const newFocalPoint: Types.Point3 = [0, 0, 0]
      const newPosition: Types.Point3 = [0, 0, 0]

      vtkMath.add(camera.focalPoint, projectedDelta, newFocalPoint)
      vtkMath.add(camera.position, projectedDelta, newPosition)

      viewport.setCamera({
        focalPoint: newFocalPoint,
        position: newPosition,
      })
      viewport.render()
    }
  }

  _pointNearReferenceLine = (
    annotation,
    canvasCoords,
    proximity,
    lineViewport
  ) => {
    const { data } = annotation
    const { rotationPoints } = data.handles

    for (let i = 0; i < rotationPoints.length - 1; ++i) {
      const otherViewport = rotationPoints[i][1]
      if (otherViewport.uid !== lineViewport.uid) {
        continue
      }

      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      if (!viewportControllable) {
        continue
      }

      const lineSegment1 = {
        start: {
          x: rotationPoints[i][2][0],
          y: rotationPoints[i][2][1],
        },
        end: {
          x: rotationPoints[i][3][0],
          y: rotationPoints[i][3][1],
        },
      }

      const distanceToPoint1 = lineSegment.distanceToPoint(
        [lineSegment1.start.x, lineSegment1.start.y],
        [lineSegment1.end.x, lineSegment1.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      const lineSegment2 = {
        start: {
          x: rotationPoints[i + 1][2][0],
          y: rotationPoints[i + 1][2][1],
        },
        end: {
          x: rotationPoints[i + 1][3][0],
          y: rotationPoints[i + 1][3][1],
        },
      }

      const distanceToPoint2 = lineSegment.distanceToPoint(
        [lineSegment2.start.x, lineSegment2.start.y],
        [lineSegment2.end.x, lineSegment2.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      if (distanceToPoint1 <= proximity || distanceToPoint2 <= proximity) {
        return true
      }

      // rotation handles are two for viewport
      i++
    }

    return false
  }

  _getRotationHandleNearImagePoint(
    viewport,
    annotation,
    canvasCoords,
    proximity
  ) {
    const { data } = annotation
    const { rotationPoints } = data.handles

    for (let i = 0; i < rotationPoints.length; i++) {
      const point = rotationPoints[i][0]
      const otherViewport = rotationPoints[i][1]
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      if (!viewportControllable) {
        continue
      }

      const viewportDraggableRotatable =
        this._getReferenceLineDraggableRotatable(otherViewport.uid)
      if (!viewportDraggableRotatable) {
        continue
      }

      const annotationCanvasCoordinate = viewport.worldToCanvas(point)
      if (vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity) {
        data.handles.activeOperation = OPERATION.ROTATE

        this.editData = {
          annotation,
        }

        return point
      }
    }

    return null
  }

  _getSlabThicknessHandleNearImagePoint(
    viewport,
    annotation,
    canvasCoords,
    proximity
  ) {
    const { data } = annotation
    const { slabThicknessPoints } = data.handles

    for (let i = 0; i < slabThicknessPoints.length; i++) {
      const point = slabThicknessPoints[i][0]
      const otherViewport = slabThicknessPoints[i][1]
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      if (!viewportControllable) {
        continue
      }

      const viewportSlabThicknessControlsOn =
        this._getReferenceLineSlabThicknessControlsOn(otherViewport.uid)
      if (!viewportSlabThicknessControlsOn) {
        continue
      }

      const annotationCanvasCoordinate = viewport.worldToCanvas(point)
      if (vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity) {
        data.handles.activeOperation = OPERATION.SLAB

        data.activeViewportUIDs = [otherViewport.uid]

        this.editData = {
          annotation,
        }

        return point
      }
    }

    return null
  }

  _pointNearTool(element, annotation, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)
    const { data } = annotation

    const { rotationPoints } = data.handles
    const { slabThicknessPoints } = data.handles
    const viewportUIDArray = []

    for (let i = 0; i < rotationPoints.length - 1; ++i) {
      const otherViewport = rotationPoints[i][1]
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      const viewportDraggableRotatable =
        this._getReferenceLineDraggableRotatable(otherViewport.uid)

      if (!viewportControllable || !viewportDraggableRotatable) {
        continue
      }

      const lineSegment1 = {
        start: {
          x: rotationPoints[i][2][0],
          y: rotationPoints[i][2][1],
        },
        end: {
          x: rotationPoints[i][3][0],
          y: rotationPoints[i][3][1],
        },
      }

      const distanceToPoint1 = lineSegment.distanceToPoint(
        [lineSegment1.start.x, lineSegment1.start.y],
        [lineSegment1.end.x, lineSegment1.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      const lineSegment2 = {
        start: {
          x: rotationPoints[i + 1][2][0],
          y: rotationPoints[i + 1][2][1],
        },
        end: {
          x: rotationPoints[i + 1][3][0],
          y: rotationPoints[i + 1][3][1],
        },
      }

      const distanceToPoint2 = lineSegment.distanceToPoint(
        [lineSegment2.start.x, lineSegment2.start.y],
        [lineSegment2.end.x, lineSegment2.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      if (distanceToPoint1 <= proximity || distanceToPoint2 <= proximity) {
        viewportUIDArray.push(otherViewport.uid)
        data.handles.activeOperation = OPERATION.DRAG
      }

      // rotation handles are two for viewport
      i++
    }

    for (let i = 0; i < slabThicknessPoints.length - 1; ++i) {
      const otherViewport = slabThicknessPoints[i][1]
      if (viewportUIDArray.find((uid) => uid === otherViewport.uid)) {
        continue
      }

      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      const viewportSlabThicknessControlsOn =
        this._getReferenceLineSlabThicknessControlsOn(otherViewport.uid)

      if (!viewportControllable || !viewportSlabThicknessControlsOn) {
        continue
      }

      const stPointLineCanvas1 = slabThicknessPoints[i][2]
      const stPointLineCanvas2 = slabThicknessPoints[i][3]

      const centerCanvas = vec2.create()
      vec2.add(centerCanvas, stPointLineCanvas1, stPointLineCanvas2)
      vec2.scale(centerCanvas, centerCanvas, 0.5)

      const canvasUnitVectorFromCenter = vec2.create()
      vec2.subtract(
        canvasUnitVectorFromCenter,
        stPointLineCanvas1,
        centerCanvas
      )
      vec2.normalize(canvasUnitVectorFromCenter, canvasUnitVectorFromCenter)

      const canvasVectorFromCenterStart = vec2.create()
      vec2.scale(
        canvasVectorFromCenterStart,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 0.05
      )

      const stPointLineCanvas1Start = vec2.create()
      const stPointLineCanvas2Start = vec2.create()
      vec2.add(
        stPointLineCanvas1Start,
        centerCanvas,
        canvasVectorFromCenterStart
      )
      vec2.subtract(
        stPointLineCanvas2Start,
        centerCanvas,
        canvasVectorFromCenterStart
      )

      const lineSegment1 = {
        start: {
          x: stPointLineCanvas1Start[0],
          y: stPointLineCanvas1Start[1],
        },
        end: {
          x: stPointLineCanvas1[0],
          y: stPointLineCanvas1[1],
        },
      }

      const distanceToPoint1 = lineSegment.distanceToPoint(
        [lineSegment1.start.x, lineSegment1.start.y],
        [lineSegment1.end.x, lineSegment1.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      const lineSegment2 = {
        start: {
          x: stPointLineCanvas2Start[0],
          y: stPointLineCanvas2Start[1],
        },
        end: {
          x: stPointLineCanvas2[0],
          y: stPointLineCanvas2[1],
        },
      }

      const distanceToPoint2 = lineSegment.distanceToPoint(
        [lineSegment2.start.x, lineSegment2.start.y],
        [lineSegment2.end.x, lineSegment2.end.y],
        [canvasCoords[0], canvasCoords[1]]
      )

      if (distanceToPoint1 <= proximity || distanceToPoint2 <= proximity) {
        viewportUIDArray.push(otherViewport.uid) // we still need this to draw inactive slab thickness handles
        data.handles.activeOperation = null // no operation
      }

      // slab thickness handles are in couples
      i++
    }

    data.activeViewportUIDs = [...viewportUIDArray]

    this.editData = {
      annotation,
    }

    return data.handles.activeOperation === OPERATION.DRAG ? true : false
  }
}
