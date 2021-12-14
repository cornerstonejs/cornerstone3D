import { BaseAnnotationTool } from './base'
// ~~ VTK Viewport
import {
  getEnabledElement,
  RenderingEngine,
  getRenderingEngine,
  Utilities as csUtils,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import {
  addToolState,
  getToolState,
  removeToolStateByToolDataUID,
} from '../stateManagement/toolState'
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg'
import { vec2, vec3 } from 'gl-matrix'
import { state } from '../store'
import { CornerstoneTools3DEvents as EVENTS } from '../enums'
import { getViewportUIDsWithToolToRender } from '../util/viewportFilters'
import { resetElementCursor, hideElementCursor } from '../cursors/elementCursor'
import { math } from '../util'
import vtkMath from 'vtk.js/Sources/Common/Core/Math'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import { lineSegment } from '../util/math'
import {
  ToolSpecificToolData,
  ToolSpecificToolState,
  Point2,
  Point3,
} from '../types'
import { isToolDataLocked } from '../stateManagement/toolDataLocking'
import triggerAnnotationRenderForViewportUIDs from '../util/triggerAnnotationRenderForViewportUIDs'

const { liangBarksyClip } = math.vec2
const { isEqual, isOpposite } = math.vec3

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

type ViewportInput = {
  renderingEngineUID: string
  viewportUID: string
}
type ViewportInputs = Array<ViewportInput>

interface CrosshairsSpecificToolData extends ToolSpecificToolData {
  data: {
    handles: {
      rotationPoints: any[] // rotation handles, used for rotation interactions
      slabThicknessPoints: any[] // slab thickness handles, used for setting the slab thickness
      activeOperation: number | null // 0 translation, 1 rotation handles, 2 slab thickness handles
      toolCenter: Point3
    }
    active: boolean
    activeViewportUIDs: string[] // a list of the viewport uids connected to the reference lines being translated
    viewportUID: string
    sceneUID: string
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

export default class CrosshairsTool extends BaseAnnotationTool {
  toolCenter: Point3 = [0, 0, 0] // NOTE: it is assumed that all the active/linked viewports share the same crosshair center.
  // This because the rotation operation rotates also all the other active/intersecting reference lines of the same angle
  _getReferenceLineColor?: (viewportUID: string) => string
  _getReferenceLineControllable?: (viewportUID: string) => boolean
  _getReferenceLineDraggableRotatable?: (viewportUID: string) => boolean
  _getReferenceLineSlabThicknessControlsOn?: (viewportUID: string) => boolean
  editData: {
    toolData: any
  } | null

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration = {
      name: 'Crosshairs',
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        shadow: true,
        // Auto pan is a configuration which will update pan
        // other viewports in the same scene if the center of the crosshairs
        // is outside of the viewport. This might be useful for the case
        // when the user is scrolling through an image (usually in the zoomed view)
        // and the crosshairs will eventually get outisde of the viewport for
        // the other viewports.
        autoPan: {
          enabled: false,
          panSize: 10,
        },
      },
    }
  ) {
    super(toolConfiguration, defaultToolConfiguration)

    // todo this is weird? why do we have this nested? What is the diff between toolOptions and toolConfiguration in addTool?
    this._getReferenceLineColor =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration.getReferenceLineColor) ||
      defaultReferenceLineColor
    this._getReferenceLineControllable =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration.getReferenceLineControllable) ||
      defaultReferenceLineControllable
    this._getReferenceLineDraggableRotatable =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration.getReferenceLineDraggableRotatable) ||
      defaultReferenceLineDraggableRotatable
    this._getReferenceLineSlabThicknessControlsOn =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration
          .getReferenceLineSlabThicknessControlsOn) ||
      defaultReferenceLineSlabThicknessControlsOn

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

  /**
   * Gets the camera from the viewport, and adds crosshairs toolData for the viewport
   * to the toolStateManager. If any toolData is found in the toolStateManager, it
   * overwrites it.
   * @param {renderingEngineUID, viewportUID}
   * @returns {normal, point} viewPlaneNormal and center of viewport canvas in world space
   */
  initializeViewport = ({
    renderingEngineUID,
    viewportUID,
  }: ViewportInput): {
    normal: Point3
    point: Point3
  } => {
    const renderingEngine = getRenderingEngine(renderingEngineUID)
    const viewport = renderingEngine.getViewport(viewportUID)
    const { element } = viewport
    const enabledElement = getEnabledElement(element)
    const { FrameOfReferenceUID, sceneUID } = enabledElement
    const { position, focalPoint, viewPlaneNormal } = viewport.getCamera()

    // Check if there is already toolData for this viewport
    let toolState = getToolState(enabledElement, this.name)
    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (toolState.length) {
      // If found, it will override it by removing the toolData and adding it later
      removeToolStateByToolDataUID(element, toolState[0].metadata.toolDataUID)
    }

    const toolData = {
      metadata: {
        cameraPosition: <Point3>[...position],
        cameraFocalPoint: <Point3>[...focalPoint],
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        handles: {
          rotationPoints: [], // rotation handles, used for rotation interactions
          slabThicknessPoints: [], // slab thickness handles, used for setting the slab thickness
          toolCenter: this.toolCenter,
        },
        active: false,
        // Todo: add enum for active Operations
        activeOperation: null, // 0 translation, 1 rotation handles, 2 slab thickness handles
        activeViewportUIDs: [], // a list of the viewport uids connected to the reference lines being translated
        viewportUID,
        sceneUID,
      },
    }

    resetElementCursor(element)

    addToolState(element, toolData)

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

    let normal3 = <Point3>[0, 0, 0]
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
   * For Crosshairs it handle the click event.
   * @param evt
   * @param interactionType
   * @returns
   */
  addNewMeasurement(
    evt: CustomEvent,
    interactionType: string
  ): CrosshairsSpecificToolData {
    const eventData = evt.detail
    const { element } = eventData

    const { currentPoints } = eventData
    const jumpWorld = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    this._jump(enabledElement, jumpWorld)

    const toolState = getToolState(enabledElement, this.name)
    const filteredToolState = this.filterInteractableToolStateForElement(
      viewport.element,
      toolState
    )

    // viewport ToolData
    const { data } = filteredToolState[0]

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
    return filteredToolState[0]
  }

  cancel = () => {
    console.log('Not implemented yet')
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    let point = this._getRotationHandleNearImagePoint(
      viewport,
      toolData,
      canvasCoords,
      proximity
    )

    if (point !== null) {
      return point
    }

    point = this._getSlabThicknessHandleNearImagePoint(
      viewport,
      toolData,
      canvasCoords,
      proximity
    )

    if (point !== null) {
      return point
    }
  }

  handleSelectedCallback = (
    evt,
    toolData,
    handle,
    interactionType = 'mouse'
  ) => {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    // NOTE: handle index or coordinates are not used when dragging.
    // This because the handle points are actually generated in the renderTool and they are a derivative
    // from the camera variables of the viewports and of the slab thickness variable.
    // Remember that the translation and rotation operations operate on the camera
    // variables and not really on the handles. Similar for the slab thickness.

    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()
  }

  //
  pointNearTool = (
    element,
    toolData,
    canvasCoords,
    proximity,
    interactionType
  ) => {
    if (this._pointNearTool(element, toolData, canvasCoords, 6)) {
      return true
    }

    return false
  }

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    this._activateModify(element)

    hideElementCursor(element)

    evt.preventDefault()
  }

  onCameraModified = (evt) => {
    const eventData = evt.detail
    const { element } = eventData
    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement
    const viewport = enabledElement.viewport as VolumeViewport

    const requireSameOrientation = false
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name,
      requireSameOrientation
    )

    const toolState = getToolState(enabledElement, this.name)
    const filteredToolState = this.filterInteractableToolStateForElement(
      element,
      toolState
    )

    // viewport ToolData
    const viewportToolData = filteredToolState[0] as CrosshairsSpecificToolData

    if (!viewportToolData) {
      return
    }

    // -- Update the camera of other linked viewports in the same scene that
    //    have the same camera in case of translation
    // -- Update the crosshair center in world coordinates in toolData.
    // This is necessary because other tools can modify the position of the slices,
    // e.g. stackscroll tool at wheel scroll. So we update the coordinates of the center always here.
    // NOTE: rotation and slab thickness handles are created/updated in renderTool.
    const currentCamera = viewport.getCamera()
    const oldCameraPosition = viewportToolData.metadata.cameraPosition
    const deltaCameraPosition: Point3 = [0, 0, 0]
    vtkMath.subtract(
      currentCamera.position,
      oldCameraPosition,
      deltaCameraPosition
    )

    const oldCameraFocalPoint = viewportToolData.metadata.cameraFocalPoint
    const deltaCameraFocalPoint: Point3 = [0, 0, 0]
    vtkMath.subtract(
      currentCamera.focalPoint,
      oldCameraFocalPoint,
      deltaCameraFocalPoint
    )

    // updated cached "previous" camera position and focal point
    viewportToolData.metadata.cameraPosition = [...currentCamera.position]
    viewportToolData.metadata.cameraFocalPoint = [...currentCamera.focalPoint]

    const viewportControllable = this._getReferenceLineControllable(
      viewport.uid
    )
    const viewportDraggableRotatable = this._getReferenceLineDraggableRotatable(
      viewport.uid
    )
    if (
      !isEqual(currentCamera.position, oldCameraPosition, 1e-3) &&
      viewportControllable &&
      viewportDraggableRotatable
    ) {
      // Is camera Modified a TRANSLATION or ROTATION?
      let IsTranslation = true

      // NOTE: it is a translation if the the focal point and camera position shifts are the same
      if (!isEqual(deltaCameraPosition, deltaCameraFocalPoint, 1e-3)) {
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
        // const otherLinkedViewportsToolDataWithSameCameraDirection =
        //   this._filterLinkedViewportWithSameOrientationAndScene(
        //     enabledElement,
        //     toolState
        //   )

        // for (
        //   let i = 0;
        //   i < otherLinkedViewportsToolDataWithSameCameraDirection.length;
        //   ++i
        // ) {
        //   const toolData =
        //     otherLinkedViewportsToolDataWithSameCameraDirection[i]
        //   const { data } = toolData
        //   const scene = renderingEngine.getScene(data.sceneUID)
        //   const otherViewport = scene.getViewport(data.viewportUID)
        //   const camera = otherViewport.getCamera()

        //   const newFocalPoint = [0, 0, 0]
        //   const newPosition = [0, 0, 0]

        //   vtkMath.add(camera.focalPoint, deltaCameraPosition, newFocalPoint)
        //   vtkMath.add(camera.position, deltaCameraPosition, newPosition)

        //   // updated cached "previous" camera position and focal point
        //   toolData.metadata.cameraPosition = [...currentCamera.position]
        //   toolData.metadata.cameraFocalPoint = [...currentCamera.focalPoint]
        // }

        // update center of the crosshair
        this.toolCenter[0] += deltaCameraPosition[0]
        this.toolCenter[1] += deltaCameraPosition[1]
        this.toolCenter[2] += deltaCameraPosition[2]
      }
    }

    // AutoPan modification
    if (this.configuration.autoPan.enabled) {
      const viewportUIDs = viewport.getScene().getViewportUIDs()
      viewportUIDs.forEach((viewportUID) => {
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
    evt,
    filteredToolState: ToolSpecificToolState
  ): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let imageNeedsUpdate = false

    for (let i = 0; i < filteredToolState.length; i++) {
      const toolData = filteredToolState[i] as CrosshairsSpecificToolData

      if (isToolDataLocked(toolData)) {
        continue
      }

      const { data } = toolData
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
        toolData,
        canvasCoords,
        6
      )

      let near = false
      if (handleNearImagePoint) {
        near = true
      } else {
        near = this._pointNearTool(element, toolData, canvasCoords, 6)
      }

      const nearToolAndNotMarkedActive = near && !data.active
      const notNearToolAndMarkedActive = !near && data.active
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        data.active = !data.active
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

  filterInteractableToolStateForElement(element, toolState) {
    if (!toolState || !toolState.length) {
      return []
    }

    const enabledElement = getEnabledElement(element)
    const { viewportUID } = enabledElement

    const viewportUIDSpecificCrosshairs = toolState.filter(
      (toolData) => toolData.data.viewportUID === viewportUID
    )

    return viewportUIDSpecificCrosshairs
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { element } = eventData
    const toolState = getToolState(svgDrawingHelper.enabledElement, this.name)
    const { renderingEngine, viewport } = svgDrawingHelper.enabledElement
    const camera = viewport.getCamera()

    const filteredToolState = this.filterInteractableToolStateForElement(
      element,
      toolState
    )

    // viewport ToolData
    const viewportToolData = filteredToolState[0]
    if (!toolState || !viewportToolData || !viewportToolData.data) {
      // No toolstate yet, and didn't just create it as we likely don't have a FrameOfReference/any data loaded yet.
      return
    }

    const annotationUID = viewportToolData.metadata.toolDataUID

    // Get cameras/canvases for each of these.
    // -- Get two world positions for this canvas in this line (e.g. the diagonal)
    // -- Convert these world positions to this canvas.
    // -- Extend/confine this line to fit in this canvas.
    // -- Render this line.

    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)

    const data = viewportToolData.data
    const crosshairCenterCanvas = viewport.worldToCanvas(this.toolCenter)

    const otherViewportToolData = this._filterUniqueViewportOrientations(
      svgDrawingHelper.enabledElement,
      toolState
    )

    const referenceLines = []

    otherViewportToolData.forEach((toolData) => {
      const { data } = toolData

      data.handles.toolCenter = this.toolCenter

      const scene = renderingEngine.getScene(data.sceneUID)
      const otherViewport = scene.getViewport(data.viewportUID)
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
      const otherCanvasCenter = [sWidth * 0.5, sHeight * 0.5]
      const otherViewportCenterWorld =
        otherViewport.canvasToWorld(otherCanvasCenter)

      const direction: Point3 = [0, 0, 0]
      vtkMath.cross(
        camera.viewPlaneNormal,
        otherCamera.viewPlaneNormal,
        direction
      )
      vtkMath.normalize(direction)
      vtkMath.multiplyScalar(<vec3>direction, otherCanvasDiagonalLength)

      const pointWorld0 = [0, 0, 0]
      vtkMath.add(otherViewportCenterWorld, direction, pointWorld0)

      const pointWorld1 = [0, 0, 0]
      vtkMath.subtract(otherViewportCenterWorld, direction, pointWorld1)

      // get canvas information for points and lines (canvas box, canvas horizontal distances)
      const pointCanvas0 = viewport.worldToCanvas(pointWorld0)

      const { focalPoint } = camera
      const focalPointCanvas = viewport.worldToCanvas(focalPoint)
      // Todo: focalpointCanvas is a lot, how is it doing arithmetics on it??
      const canvasBox = [
        focalPointCanvas - sWidth * 0.5,
        focalPointCanvas + sWidth * 0.5,
        focalPointCanvas - sHeight * 0.5,
        focalPointCanvas + sHeight * 0.5,
      ]

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
        otherViewportToolData.length === 2 ? canvasDiagonalLength * 0.04 : 0
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
      let stHandlesCenterWorld = [...this.toolCenter]
      if (
        !otherViewportDraggableRotatable &&
        otherViewportSlabThicknessControlsOn
      ) {
        stHandlesCenterWorld = [...otherViewportCenterWorld]
      }

      const worldUnitVectorFromCenter: Point3 = [0, 0, 0]
      vtkMath.subtract(pointWorld0, pointWorld1, worldUnitVectorFromCenter)
      vtkMath.normalize(worldUnitVectorFromCenter)

      const { viewPlaneNormal } = camera
      // @ts-ignore
      const { matrix } = vtkMatrixBuilder
        .buildFromDegree()
        .rotate(90, viewPlaneNormal)

      const worldUnitOrthoVectorFromCenter: Point3 = [0, 0, 0]
      vec3.transformMat4(
        worldUnitOrthoVectorFromCenter,
        worldUnitVectorFromCenter,
        matrix
      )

      const slabThicknessValue = otherViewport.getSlabThickness()
      const worldOrthoVectorFromCenter: Point3 = [
        ...worldUnitOrthoVectorFromCenter,
      ]
      vtkMath.multiplyScalar(worldOrthoVectorFromCenter, slabThicknessValue)

      const worldVerticalRefPoint: Point3 = [0, 0, 0]
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
          this.name,
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
          this.name,
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
          this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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
            this.name,
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

    // Save new handles points in toolData
    data.handles.rotationPoints = newRtpoints
    data.handles.slabThicknessPoints = newStpoints

    // render a circle to pin point the viewport color
    // TODO: This should not be part of the tool, and definitely not part of the renderToolData loop
    const referenceColorCoordinates = [sWidth * 0.95, sHeight * 0.05] as Point2
    const circleRadius = canvasDiagonalLength * 0.01

    const circleUID = '0'
    drawCircleSvg(
      svgDrawingHelper,
      this.name,
      annotationUID,
      circleUID,
      referenceColorCoordinates,
      circleRadius,
      { color, fill: color }
    )
  }

  _autoPanViewportIfNecessary(
    viewportUID: string,
    renderingEngine: RenderingEngine
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

    const updatedPosition = <Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ]

    const updatedFocalPoint = <Point3>[
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

  _filterViewportOrientations = (enabledElement, toolState) => {
    const { viewportUID, renderingEngine, viewport } = enabledElement

    const otherViewportToolData = toolState.filter(
      (toolData) => toolData.data.viewportUID !== viewportUID
    )

    if (!otherViewportToolData || !otherViewportToolData.length) {
      return []
    }

    const camera = viewport.getCamera()
    const { viewPlaneNormal, position } = camera

    const viewportsWithDifferentCameras = otherViewportToolData.filter(
      (toolData) => {
        const { sceneUID, viewportUID } = toolData.data
        const scene = renderingEngine.getScene(sceneUID)
        const targetViewport = scene.getViewport(viewportUID)
        const cameraOfTarget = targetViewport.getCamera()

        return !(
          isEqual(cameraOfTarget.viewPlaneNormal, viewPlaneNormal, 1e-2) &&
          isEqual(cameraOfTarget.position, position, 1)
        )
      }
    )

    return viewportsWithDifferentCameras
  }

  _filterLinkedViewportWithSameOrientationAndScene = (
    enabledElement,
    toolState
  ) => {
    const { scene, renderingEngine, viewport } = enabledElement
    const viewportControllable = this._getReferenceLineControllable(
      viewport.uid
    )

    const otherLinkedViewportToolDataFromSameScene = toolState.filter(
      (toolData) => {
        const { data } = toolData
        const otherScene = renderingEngine.getScene(data.sceneUID)
        const otherViewport = otherScene.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          scene === otherScene &&
          otherViewportControllable === true &&
          viewportControllable === true
        )
      }
    )

    if (
      !otherLinkedViewportToolDataFromSameScene ||
      !otherLinkedViewportToolDataFromSameScene.length
    ) {
      return []
    }

    const camera = viewport.getCamera()
    const viewPlaneNormal = camera.viewPlaneNormal
    vtkMath.normalize(viewPlaneNormal)

    const otherLinkedViewportsToolDataWithSameCameraDirection =
      otherLinkedViewportToolDataFromSameScene.filter((toolData) => {
        const { sceneUID, viewportUID } = toolData.data
        const scene = renderingEngine.getScene(sceneUID)
        const otherViewport = scene.getViewport(viewportUID)
        const otherCamera = otherViewport.getCamera()
        const otherViewPlaneNormal = otherCamera.viewPlaneNormal
        vtkMath.normalize(otherViewPlaneNormal)

        return (
          isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) &&
          isEqual(camera.viewUp, otherCamera.viewUp, 1e-2)
        )
      })

    return otherLinkedViewportsToolDataWithSameCameraDirection
  }

  _filterUniqueViewportOrientations = (enabledElement, toolState) => {
    const { renderingEngine, scene, viewport } = enabledElement
    const camera = viewport.getCamera()
    const viewPlaneNormal = camera.viewPlaneNormal
    vtkMath.normalize(viewPlaneNormal)

    const otherLinkedViewportToolDataFromSameScene = toolState.filter(
      (toolData) => {
        const { data } = toolData
        const otherScene = renderingEngine.getScene(data.sceneUID)
        const otherViewport = otherScene.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          scene === otherScene &&
          otherViewportControllable === true
        )
      }
    )

    const otherViewportsToolDataWithUniqueCameras = []
    // Iterate first on other viewport from the same scene linked
    for (let i = 0; i < otherLinkedViewportToolDataFromSameScene.length; ++i) {
      const toolData = otherLinkedViewportToolDataFromSameScene[i]
      const { sceneUID, viewportUID } = toolData.data
      const scene = renderingEngine.getScene(sceneUID)
      const otherViewport = scene.getViewport(viewportUID)
      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsToolDataWithUniqueCameras.length;
        ++jj
      ) {
        const stockedToolData = otherViewportsToolDataWithUniqueCameras[jj]
        const { sceneUID, viewportUID } = stockedToolData.data
        const scene = renderingEngine.getScene(sceneUID)
        const stockedViewport = scene.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsToolDataWithUniqueCameras.push(toolData)
      }
    }

    const otherNonLinkedViewportToolDataFromSameScene = toolState.filter(
      (toolData) => {
        const { data } = toolData
        const otherScene = renderingEngine.getScene(data.sceneUID)
        const otherViewport = otherScene.getViewport(data.viewportUID)
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.uid
        )

        return (
          viewport !== otherViewport &&
          scene === otherScene &&
          otherViewportControllable !== true
        )
      }
    )

    // Iterate second on other viewport from the same scene non linked
    for (
      let i = 0;
      i < otherNonLinkedViewportToolDataFromSameScene.length;
      ++i
    ) {
      const toolData = otherNonLinkedViewportToolDataFromSameScene[i]
      const { sceneUID, viewportUID } = toolData.data
      const scene = renderingEngine.getScene(sceneUID)
      const otherViewport = scene.getViewport(viewportUID)

      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsToolDataWithUniqueCameras.length;
        ++jj
      ) {
        const stockedToolData = otherViewportsToolDataWithUniqueCameras[jj]
        const { sceneUID, viewportUID } = stockedToolData.data
        const scene = renderingEngine.getScene(sceneUID)
        const stockedViewport = scene.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsToolDataWithUniqueCameras.push(toolData)
      }
    }

    // Iterate on all the viewport
    const otherViewportToolData = this._filterViewportOrientations(
      enabledElement,
      toolState
    )

    for (let i = 0; i < otherViewportToolData.length; ++i) {
      const toolData = otherViewportToolData[i]
      if (
        otherViewportsToolDataWithUniqueCameras.find(
          (element) => element === toolData
        ) === true
      ) {
        continue
      }

      const { sceneUID, viewportUID } = toolData.data
      const scene = renderingEngine.getScene(sceneUID)
      const otherViewport = scene.getViewport(viewportUID)
      const otherCamera = otherViewport.getCamera()
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal
      vtkMath.normalize(otherViewPlaneNormal)

      if (
        isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue
      }

      let cameraFound = false
      for (
        let jj = 0;
        jj < otherViewportsToolDataWithUniqueCameras.length;
        ++jj
      ) {
        const stockedToolData = otherViewportsToolDataWithUniqueCameras[jj]
        const { sceneUID, viewportUID } = stockedToolData.data
        const scene = renderingEngine.getScene(sceneUID)
        const stockedViewport = scene.getViewport(viewportUID)
        const cameraOfStocked = stockedViewport.getCamera()

        if (
          isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true
        }
      }

      if (!cameraFound) {
        otherViewportsToolDataWithUniqueCameras.push(toolData)
      }
    }

    return otherViewportsToolDataWithUniqueCameras
  }

  _jump = (enabledElement, jumpWorld) => {
    state.isInteractingWithTool = true

    const toolState = getToolState(enabledElement, this.name)
    const { renderingEngine, scene } = enabledElement

    const delta: Point3 = [0, 0, 0]
    vtkMath.subtract(jumpWorld, this.toolCenter, delta)

    // TRANSLATION
    // get the toolData of the other viewport which are parallel to the delta shift and are of the same scene
    const otherViewportToolData = this._filterViewportOrientations(
      enabledElement,
      toolState
    )

    const viewportsToolDataToUpdate = otherViewportToolData.filter(
      (toolData) => {
        const { data } = toolData
        const otherScene = renderingEngine.getScene(data.sceneUID)
        const otherViewport = otherScene.getViewport(data.viewportUID)

        return (
          this._getReferenceLineControllable(otherViewport.uid) &&
          this._getReferenceLineDraggableRotatable(otherViewport.uid) &&
          otherScene === scene
        )
      }
    )

    if (viewportsToolDataToUpdate.length === 0) {
      state.isInteractingWithTool = false
      return false
    }

    this._applyDeltaShiftToSelectedViewportCameras(
      renderingEngine,
      viewportsToolDataToUpdate,
      delta
    )

    state.isInteractingWithTool = false

    return true
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

  _mouseUpCallback(evt) {
    const eventData = evt.detail
    const { element } = eventData

    this.editData.toolData.data.active = false
    this.editData.toolData.data.handles.activeOperation = null
    this.editData.toolData.data.activeViewportUIDs = []

    this._deactivateModify(element)

    resetElementCursor(element)

    this.editData = null

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    const requireSameOrientation = false
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name,
      requireSameOrientation
    )

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragCallback(evt) {
    const eventData = evt.detail
    const delta = eventData.deltaPoints.world

    if (
      Math.abs(delta[0]) < 1e-3 &&
      Math.abs(delta[1]) < 1e-3 &&
      Math.abs(delta[2]) < 1e-3
    ) {
      return
    }

    const { element } = eventData
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const toolState = getToolState(enabledElement, this.name)
    const filteredToolState = this.filterInteractableToolStateForElement(
      element,
      toolState
    )

    // viewport ToolData
    const viewportToolData = filteredToolState[0]
    if (!viewportToolData) {
      return
    }

    const { handles } = viewportToolData.data
    const { currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas

    if (handles.activeOperation === OPERATION.DRAG) {
      // TRANSLATION
      // get the toolData of the other viewport which are parallel to the delta shift and are of the same scene
      const otherViewportToolData = this._filterViewportOrientations(
        enabledElement,
        toolState
      )

      const viewportsToolDataToUpdate = otherViewportToolData.filter(
        (toolData) => {
          const { data } = toolData
          const scene = renderingEngine.getScene(data.sceneUID)
          const otherViewport = scene.getViewport(data.viewportUID)

          return viewportToolData.data.activeViewportUIDs.find(
            (uid) => uid === otherViewport.uid
          )
        }
      )

      this._applyDeltaShiftToSelectedViewportCameras(
        renderingEngine,
        viewportsToolDataToUpdate,
        delta
      )
    } else if (handles.activeOperation === OPERATION.ROTATE) {
      // ROTATION
      const otherViewportToolData = this._filterViewportOrientations(
        enabledElement,
        toolState
      )

      const scene = renderingEngine.getScene(viewportToolData.data.sceneUID)

      const viewportsToolDataToUpdate = otherViewportToolData.filter(
        (toolData) => {
          const { data } = toolData
          data.handles.toolCenter = center
          const otherScene = renderingEngine.getScene(data.sceneUID)
          const otherViewport = otherScene.getViewport(data.viewportUID)
          const otherViewportControllable = this._getReferenceLineControllable(
            otherViewport.uid
          )
          const otherViewportRotatable =
            this._getReferenceLineDraggableRotatable(otherViewport.uid)

          return (
            scene === otherScene &&
            otherViewportControllable === true &&
            otherViewportRotatable === true
          )
        }
      )

      const dir1 = vec2.create()
      const dir2 = vec2.create()

      const center: Point3 = [
        this.toolCenter[0],
        this.toolCenter[1],
        this.toolCenter[2],
      ]

      const centerCanvas = viewport.worldToCanvas(center)

      const finalPointCanvas = eventData.currentPoints.canvas
      const originalPointCanvas = vec2.create()
      vec2.sub(
        originalPointCanvas,
        finalPointCanvas,
        eventData.deltaPoints.canvas
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
      viewportsToolDataToUpdate.forEach((toolData) => {
        const { data } = toolData
        data.handles.toolCenter = center

        const scene = renderingEngine.getScene(data.sceneUID)
        const otherViewport = scene.getViewport(data.viewportUID)
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
      const viewportsToolDataToUpdate = toolState.filter(
        (toolData: CrosshairsSpecificToolData) => {
          const { data } = toolData
          const scene = renderingEngine.getScene(data.sceneUID)
          const otherViewport = scene.getViewport(data.viewportUID)

          return viewportToolData.data.activeViewportUIDs.find(
            (uid) => uid === otherViewport.uid
          )
        }
      )

      viewportsToolDataToUpdate.forEach(
        (toolData: CrosshairsSpecificToolData) => {
          const { data } = toolData

          const scene = renderingEngine.getScene(data.sceneUID)
          const otherViewport = scene.getViewport(data.viewportUID)
          const camera = otherViewport.getCamera()
          const normal = camera.viewPlaneNormal

          const dotProd = vtkMath.dot(delta, normal)
          const projectedDelta: Point3 = [...normal]
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

            const currentPoint = eventData.lastPoints.world
            const direction: Point3 = [0, 0, 0]

            const currentCenter: Point3 = [
              this.toolCenter[0],
              this.toolCenter[1],
              this.toolCenter[2],
            ]

            // use this.toolCenter only if viewportDraggableRotatable
            const viewportDraggableRotatable =
              this._getReferenceLineDraggableRotatable(otherViewport.uid)
            if (!viewportDraggableRotatable) {
              const { rotationPoints } = this.editData.toolData.data.handles
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
                vtkMath.multiplyScalar(<vec3>currentCenter, 0.5)
              }
            }

            vtkMath.subtract(currentPoint, currentCenter, direction)
            const dotProdDirection = vtkMath.dot(direction, normal)
            const projectedDirection: Point3 = [...normal]
            vtkMath.multiplyScalar(projectedDirection, dotProdDirection)
            const normalizedProjectedDirection: Point3 = [
              projectedDirection[0],
              projectedDirection[1],
              projectedDirection[2],
            ]
            vec3.normalize(
              normalizedProjectedDirection,
              normalizedProjectedDirection
            )
            const normalizedProjectedDelta: Point3 = [
              projectedDelta[0],
              projectedDelta[1],
              projectedDelta[2],
            ]
            vec3.normalize(normalizedProjectedDelta, normalizedProjectedDelta)

            let slabThicknessValue = otherViewport.getSlabThickness()
            if (
              isOpposite(
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
              viewportToolData,
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
    viewportsToolDataToUpdate,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    viewportsToolDataToUpdate.forEach((toolData) => {
      this._applyDeltaShiftToViewportCamera(renderingEngine, toolData, delta)
    })
  }
  _applyDeltaShiftToViewportCamera(
    renderingEngine: RenderingEngine,
    toolData,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    const { data } = toolData

    const scene = renderingEngine.getScene(data.sceneUID)
    const viewport = scene.getViewport(data.viewportUID)
    const camera = viewport.getCamera()
    const normal = camera.viewPlaneNormal

    // Project delta over camera normal
    // (we don't need to pan, we need only to scroll the camera as in the wheel stack scroll tool)
    const dotProd = vtkMath.dot(delta, normal)
    const projectedDelta: Point3 = [...normal]
    vtkMath.multiplyScalar(projectedDelta, dotProd)

    if (
      Math.abs(projectedDelta[0]) > 1e-3 ||
      Math.abs(projectedDelta[1]) > 1e-3 ||
      Math.abs(projectedDelta[2]) > 1e-3
    ) {
      const newFocalPoint: Point3 = [0, 0, 0]
      const newPosition: Point3 = [0, 0, 0]

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
    toolData,
    canvasCoords,
    proximity,
    lineViewport
  ) => {
    const { data } = toolData
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
    toolData,
    canvasCoords,
    proximity
  ) {
    const { data } = toolData
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

      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)
      if (vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity) {
        data.handles.activeOperation = OPERATION.ROTATE

        this.editData = {
          toolData,
        }

        return point
      }
    }

    return null
  }

  _getSlabThicknessHandleNearImagePoint(
    viewport,
    toolData,
    canvasCoords,
    proximity
  ) {
    const { data } = toolData
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

      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)
      if (vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity) {
        data.handles.activeOperation = OPERATION.SLAB

        data.activeViewportUIDs = [otherViewport.uid]

        this.editData = {
          toolData,
        }

        return point
      }
    }

    return null
  }

  _pointNearTool(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)
    const { data } = toolData

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
      toolData,
    }

    return data.handles.activeOperation === OPERATION.DRAG ? true : false
  }
}
