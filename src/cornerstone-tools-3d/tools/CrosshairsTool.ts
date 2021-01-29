import { BaseAnnotationTool } from './base/index'
// ~~ VTK Viewport
import { getEnabledElement } from '../../index'
import { addToolState, getToolState } from '../stateManagement/toolState'
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg'
import { vec2, vec3 } from 'gl-matrix'
import { state } from '../store'
import { CornerstoneTools3DEvents as EVENTS } from '../enums'
import { getViewportUIDsWithToolToRender } from '../util/viewportFilters'
import { showToolCursor, hideToolCursor } from '../store/toolCursor'
import { math } from '../util'
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math'
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder'
import cornerstoneMath from 'cornerstone-math'
import {
  ToolSpecificToolData,
  ToolSpecificToolState,
  Point2,
  Point3,
} from '../types'
import { ToolGroupManager } from './../store/index'
import { elementType } from 'prop-types'

const { liangBarksyClip } = math.vec2
const { isEqual, isOpposite } = math.vec3

// TODO: nested config is weird
interface ToolConfiguration {
  configuration?: {
    getReferenceLineControllable?: (viewportUID: string) => boolean
    getReferenceLineColor?: (viewportUID: string) => string
    shadow?: boolean
  }
}

function defaultReferenceLineColor() {
  return 'rgb(200, 200, 200)'
}

function defaultReferenceLineControllable() {
  return true
}

export default class CrosshairsTool extends BaseAnnotationTool {
  toolCenter: Point3 = [0, 0, 0] // NOTE: it is assumed that all the active/linked viewports share the same crosshair center.
  // This because the rotation operation rotates also all the other active/intersecting reference lines of the same angle
  _getReferenceLineColor?: (viewportUID: string) => string
  _getReferenceLineControllable?: (viewportUID: string) => boolean
  editData: {
    toolData: any
  } | null

  constructor(toolConfiguration: ToolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Crosshairs',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true },
    })

    // todo this is weird? why do we have this nested? What is the diff between toolOptions and toolConfiguration in addTool?
    this._getReferenceLineColor =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration.getReferenceLineColor) ||
      defaultReferenceLineColor
    this._getReferenceLineControllable =
      (toolConfiguration.configuration &&
        toolConfiguration.configuration.getReferenceLineControllable) ||
      defaultReferenceLineControllable

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

  addNewMeasurement(evt, interactionType) {
    // not used, but is necessary if BaseAnnotationTool.
    // NOTE: this is a BaseAnnotationTool and not a BaseTool, because in future
    // we will likely pre-filter all tools using typeof / instanceof
    // in the mouse down dispatchers where we check for methods like pointNearTool.
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    // We need a better way of surfacing this...
    const {
      viewportUid: viewportUID,
      sceneUid: sceneUID,
      renderingEngineUid: renderingEngineUID,
    } = element.dataset
    const toolGroups = ToolGroupManager.getToolGroups(
      renderingEngineUID,
      sceneUID,
      viewportUID
    )
    const groupTools = toolGroups[0]?.tools
    const mode = groupTools[this.name]?.mode

    // We don't want this annotation tool to render or be interactive unless its
    // active
    if (mode !== 'Active') {
      return undefined
    }

    // TODO square (?) handles to pull MIP slabs (i.e. like Radiant.)

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points } = data.handles

    for (let i = 0; i < points.length; i++) {
      const point = points[i][0]
      const viewportControllable = this._getReferenceLineControllable(
        points[i][1].uid
      )
      if (!viewportControllable) {
        continue
      }

      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

      if (vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity) {
        data.handles.activeOperation = 1 // rotation

        this.editData = {
          toolData,
        }

        return point
      }
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

    // NOTE: handle index or coordinates at the moment are not used when dragging.
    // Probably the returned point will be needed when implementing the slabthickness,
    // but now not (we use the handle points only in the renderTool and they are a derivate
    // from the camera varibales of the viewports).
    // Remember that the translation and rotation operations operate on the camera
    // variables and not really on the handles.

    this._activateModify(element)

    hideToolCursor(element)

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
    // We need a better way of surfacing this...
    const {
      viewportUid: viewportUID,
      sceneUid: sceneUID,
      renderingEngineUid: renderingEngineUID,
    } = element.dataset
    const toolGroups = ToolGroupManager.getToolGroups(
      renderingEngineUID,
      sceneUID,
      viewportUID
    )
    const groupTools = toolGroups[0]?.tools
    const mode = groupTools[this.name]?.mode

    // We don't want this annotation tool to render or be interactive unless its
    // active
    if (mode !== 'Active') {
      return false
    }

    // This iterates all instances of Crosshairs across all toolGroups
    // And updates `isCrosshairsActive` if ANY are active?
    let isCrosshairsActive = false
    for (let i = 0; i < toolGroups.length; ++i) {
      const toolGroup = toolGroups[i]
      const tool = toolGroup.tools['Crosshairs']

      if (tool.mode === 'Active') {
        isCrosshairsActive = true
        break
      }
    }

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)
    const { data } = toolData

    const center = this.toolCenter
    const { points } = data.handles
    const viewportArray = []

    for (let i = 0; i < points.length; ++i) {
      const otherViewport = points[i][1]
      const point = points[i][0]
      const refLineDirection = [0, 0, 0]
      const point1: Point3 = [0, 0, 0]
      const point2: Point3 = [0, 0, 0]
      vtkMath.subtract(center, point, refLineDirection)
      vtkMath.normalize(refLineDirection)
      vtkMath.multiplyScalar(refLineDirection, canvasDiagonalLength * 2)
      vtkMath.subtract(center, refLineDirection, point1)
      vtkMath.add(center, refLineDirection, point2)

      const canavasPoint1 = viewport.worldToCanvas(point1)
      const canavasPoint2 = viewport.worldToCanvas(point2)

      const lineSegment = {
        start: {
          x: canavasPoint1[0],
          y: canavasPoint1[1],
        },
        end: {
          x: canavasPoint2[0],
          y: canavasPoint2[1],
        },
      }

      const distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(
        lineSegment,
        {
          x: canvasCoords[0],
          y: canvasCoords[1],
        }
      )

      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.uid
      )
      if (distanceToPoint <= proximity && viewportControllable) {
        this.editData = {
          toolData,
        }

        viewportArray.push(otherViewport)
        data.handles.activeOperation = 0 // translation
      }

      // rotation handles are two for viewport
      i++
    }

    if (data.handles.activeOperation === 0) {
      data.activeViewports = [...viewportArray]
      return true
    }

    if (interactionType !== 'mouseMove') {
      this.editData = {
        toolData,
      }

      this._Jump(enabledElement, canvasCoords)
      return this.pointNearTool(
        element,
        toolData,
        canvasCoords,
        proximity,
        interactionType
      )
    }
  }

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    this._activateModify(element)

    hideToolCursor(element)

    evt.preventDefault()
  }

  onCameraModified = (evt) => {
    const eventData = evt.detail
    const { canvas: element } = eventData
    const enabledElement = getEnabledElement(element)
    const { FrameOfReferenceUID, renderingEngine, viewport } = enabledElement

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    let toolState = getToolState(enabledElement, this.name)
    let filteredToolState = this.filterInteractableToolStateForElement(
      element,
      toolState
    )

    if (!filteredToolState.length && FrameOfReferenceUID) {
      this._initCrosshairs(evt, toolState)

      toolState = getToolState(enabledElement, this.name)

      filteredToolState = this.filterInteractableToolStateForElement(
        element,
        toolState
      )
    }

    // viewport ToolData
    const viewportToolData = filteredToolState[0]

    // -- Update the camera of the linked viewports in case of translation (e.g. scroll wheel events)
    // -- Update the crosshair center in world coordinates in toolData.
    // This is necessary because other tools can modify the position of the slices,
    // e.g. stackscroll tool at wheel scroll. So we update the coordinates of the handles always here.
    // NOTE: rotation handles position are created/updated in renderTool.
    if (viewportToolData) {
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
      if (
        !isEqual(currentCamera.position, oldCameraPosition, 1e-3) &&
        viewportControllable
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
          const otherLinkedViewportsToolDataWithSameCameraDirection = this._filterLinkedViewportWithSameOrientationAndScene(
            enabledElement,
            toolState
          )

          for (
            let i = 0;
            i < otherLinkedViewportsToolDataWithSameCameraDirection.length;
            ++i
          ) {
            const toolData =
              otherLinkedViewportsToolDataWithSameCameraDirection[i]
            const { data } = toolData
            const scene = renderingEngine.getScene(data.sceneUID)
            const otherViewport = scene.getViewport(data.viewportUID)
            const camera = otherViewport.getCamera()

            const newFocalPoint = [0, 0, 0]
            const newPosition = [0, 0, 0]

            vtkMath.add(camera.focalPoint, deltaCameraPosition, newFocalPoint)
            vtkMath.add(camera.position, deltaCameraPosition, newPosition)

            // updated cached "previous" camera position and focal point
            toolData.metadata.cameraPosition = [...currentCamera.position]
            toolData.metadata.cameraFocalPoint = [...currentCamera.focalPoint]

            // update camera
            otherViewport.setCamera({
              focalPoint: newFocalPoint,
              position: newPosition,
            })

            otherViewport.render()
          }

          // update center of the crosshair
          const center = this.toolCenter

          center[0] += deltaCameraPosition[0]
          center[1] += deltaCameraPosition[1]
          center[2] += deltaCameraPosition[2]
        }
      }
    }

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  mouseMoveCallback = (
    evt,
    filteredToolState: ToolSpecificToolState
  ): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let imageNeedsUpdate = false

    for (let i = 0; i < filteredToolState.length; i++) {
      const toolData = filteredToolState[i]
      const { data } = toolData

      // This init are necessary, because when we move the mouse they are not cleaned by _mouseUpCallback
      data.activeViewports = []
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
        near = this.pointNearTool(
          element,
          toolData,
          canvasCoords,
          6,
          'mouseMove'
        )
      }

      const nearToolAndNotMarkedActive = near && !data.active
      const notNearToolAndMarkedActive = !near && data.active
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        data.active = !data.active
        imageNeedsUpdate = true
      } else if (data.handles && data.handles.activeOperation !== null) {
        // Active handle index has changed, re-render.
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
    const { renderingEngineUID, sceneUID, viewportUID } = evt.detail
    const toolGroups = ToolGroupManager.getToolGroups(
      renderingEngineUID,
      sceneUID,
      viewportUID
    )

    // This iterates all instances of Crosshairs across all toolGroups
    // And updates `isCrosshairsActive` if ANY are active?
    let isCrosshairsActive = false
    for (let i = 0; i < toolGroups.length; ++i) {
      const toolGroup = toolGroups[i]
      const tool = toolGroup.tools['Crosshairs']

      if (tool.mode === 'Active') {
        isCrosshairsActive = true
        break
      }
    }

    // So if none are active, we have nothing to render, and we peace out
    if (!isCrosshairsActive) {
      return
    }

    const eventData = evt.detail
    const { canvas: element } = eventData
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

    const annotationUID = viewportToolData.metadata.toolUID

    // Get cameras/canvases for each of these.
    // -- Get two world positions for this canvas in this line (e.g. the diagonal)
    // -- Convert these world positions to this canvas.
    // -- Extend/confine this line to fit in this canvas.
    // -- Render this line.

    const linesWorld = []

    const otherViewportToolData = this._filterUniqueViewportOrientations(
      svgDrawingHelper.enabledElement,
      toolState
    )

    otherViewportToolData.forEach((toolData) => {
      const { data } = toolData

      const scene = renderingEngine.getScene(data.sceneUID)
      const otherViewport = scene.getViewport(data.viewportUID)
      const otherCamera = otherViewport.getCamera()

      // get coordinates for the reference line
      const { sWidth, sHeight } = otherViewport
      const canvasDiagonalLength = Math.sqrt(
        sWidth * sWidth + sHeight * sHeight
      )
      const centerCanvas = [sWidth * 0.5, sHeight * 0.5]
      const centerWorld = otherViewport.canvasToWorld(centerCanvas)

      const direction = [0, 0, 0]
      vtkMath.cross(
        camera.viewPlaneNormal,
        otherCamera.viewPlaneNormal,
        direction
      )
      vtkMath.normalize(direction)
      vtkMath.multiplyScalar(direction, canvasDiagonalLength)

      const world1 = [0, 0, 0]
      vtkMath.add(centerWorld, direction, world1)
      const world2 = [0, 0, 0]
      vtkMath.multiplyScalar(direction, -1)
      vtkMath.add(centerWorld, direction, world2)

      linesWorld.push([world1, world2, otherViewport])
    })

    const lineSegmentsCanvas = linesWorld.map((line) => {
      return [
        viewport.worldToCanvas(line[0]),
        viewport.worldToCanvas(line[1]),
        line[2],
      ]
    })

    const { sWidth, sHeight } = viewport
    const canvasDiagonalLength = Math.sqrt(sWidth * sWidth + sHeight * sHeight)

    const data = viewportToolData.data
    const crosshairCenterCanvas = viewport.worldToCanvas(this.toolCenter)

    const referenceLines = lineSegmentsCanvas.map((lineSegment) => {
      const [point0, point1, viewport] = lineSegment

      const center = [
        (point0[0] + point1[0]) * 0.5,
        (point0[1] + point1[1]) * 0.5,
        0,
      ]

      const pointNew = [point0[0], point0[1], 0]
      const unitVectorFromCenter = [0, 0, 0]
      vtkMath.subtract(pointNew, center, unitVectorFromCenter)
      vtkMath.normalize(unitVectorFromCenter, unitVectorFromCenter)

      const distantPoint = [
        center[0] + unitVectorFromCenter[0] * canvasDiagonalLength,
        center[1] + unitVectorFromCenter[1] * canvasDiagonalLength,
      ]

      const negativeDistantPoint = [
        center[0] - unitVectorFromCenter[0] * canvasDiagonalLength,
        center[1] - unitVectorFromCenter[1] * canvasDiagonalLength,
      ]

      const handleOne = [
        crosshairCenterCanvas[0] -
          unitVectorFromCenter[0] * canvasDiagonalLength * 0.15,
        crosshairCenterCanvas[1] -
          unitVectorFromCenter[1] * canvasDiagonalLength * 0.15,
      ]

      const handleTwo = [
        crosshairCenterCanvas[0] +
          unitVectorFromCenter[0] * canvasDiagonalLength * 0.15,
        crosshairCenterCanvas[1] +
          unitVectorFromCenter[1] * canvasDiagonalLength * 0.15,
      ]

      liangBarksyClip(negativeDistantPoint, distantPoint, [
        0, //xmin
        0, // ymin
        sWidth, // xmax
        sHeight, // ymax
      ])

      return [
        negativeDistantPoint,
        distantPoint,
        handleOne,
        handleTwo,
        viewport,
      ]
    })

    const newPoints = []
    const viewportColor = this._getReferenceLineColor(viewport.uid)
    const color =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'

    referenceLines.forEach((line, lineIndex) => {
      // get color for the reference line
      const viewportColor = this._getReferenceLineColor(line[4].uid)
      const viewportControllable = this._getReferenceLineControllable(
        line[4].uid
      )
      let color =
        viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'
      let lineWidth = 1
      const lineActive =
        data.handles.activeOperation !== null &&
        data.handles.activeOperation === 0 &&
        data.activeViewports.find((element) => element === line[4])

      if (lineActive) {
        lineWidth = 2.5
      }

      const lineUID = `${lineIndex}`
      drawLineSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        lineUID,
        line[0],
        line[1],
        {
          color,
          width: lineWidth,
        }
      )

      if (viewportControllable) {
        color =
          viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)'

        const handleActive =
          data.handles.activeOperation !== null &&
          data.handles.activeOperation > 0

        const rotHandlesOptions = handleActive
          ? { color, handleRadius: 3, fill: color }
          : { color, handleRadius: 4 }
        const rotationHandles = [line[2], line[3]]

        if (lineActive || handleActive) {
          drawHandlesSvg(
            svgDrawingHelper,
            this.name,
            annotationUID,
            lineUID,
            rotationHandles,
            rotHandlesOptions
          )
        }

        const handleWorldOne = [viewport.canvasToWorld(line[2]), line[4]]
        const handleWorldTwo = [viewport.canvasToWorld(line[3]), line[4]]
        newPoints.push(handleWorldOne, handleWorldTwo)
      }
    })

    // render a circle to pin point the viewport color
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

    data.handles.points = newPoints
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

    const otherLinkedViewportsToolDataWithSameCameraDirection = otherLinkedViewportToolDataFromSameScene.filter(
      (toolData) => {
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
      }
    )

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

  _initCrosshairs = (evt, toolState) => {
    const eventData = evt.detail
    const { canvas: element } = eventData
    const enabledElement = getEnabledElement(element)
    const {
      viewport,
      FrameOfReferenceUID,
      viewportUID,
      sceneUID,
    } = enabledElement
    const { sHeight, sWidth, canvasToWorld } = viewport
    const centerCanvas: Point2 = [sWidth * 0.5, sHeight * 0.5]

    // Calculate the crosshair center
    // NOTE: it is assumed that all the active/linked viewports share the same crosshair center.
    // This because the rotation operations rotates also all the other active/intersecting reference lines of the same angle
    this.toolCenter = canvasToWorld(centerCanvas)

    const camera = viewport.getCamera()
    const { position, focalPoint } = camera

    const toolData = {
      metadata: {
        cameraPosition: [...position],
        cameraFocalPoint: [...focalPoint],
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        handles: {
          points: [], // rotation handles, used for rotation interactions
        },
        active: false,
        activeOperation: null, // 0 translation, 1 rotation handles
        activeViewports: [], // a list of the viewports connected to the reference lines being translated
        viewportUID,
        sceneUID,
      },
    }

    // NOTE: rotation handles are initialized in renderTool when drawing.

    addToolState(element, toolData)

    showToolCursor(element)
  }

  _Jump(enabledElement, canvasCoords) {
    state.isToolLocked = true

    const toolState = getToolState(enabledElement, this.name)
    const { renderingEngine, viewport, scene } = enabledElement

    const jumpWorld = viewport.canvasToWorld(canvasCoords)
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
          otherScene === scene
        )
      }
    )

    this._applyDeltaShiftToSelectedViewportCameras(
      renderingEngine,
      viewportsToolDataToUpdate,
      delta
    )

    state.isToolLocked = false
  }

  _activateModify(element) {
    state.isToolLocked = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify(element) {
    state.isToolLocked = false

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
    this.editData.toolData.data.activeViewports = []

    this._deactivateModify(element)

    showToolCursor(element)

    this.editData = null

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    renderingEngine.renderViewports(viewportUIDsToRender)
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

    const { element: canvas } = eventData
    const enabledElement = getEnabledElement(canvas)
    const { renderingEngine, viewport } = enabledElement
    const toolState = getToolState(enabledElement, this.name)
    const filteredToolState = this.filterInteractableToolStateForElement(
      canvas,
      toolState
    )

    // viewport ToolData
    const viewportToolData = filteredToolState[0]
    if (!viewportToolData) {
      return
    }

    const { handles } = viewportToolData.data

    if (handles.activeOperation === 0) {
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

          return viewportToolData.data.activeViewports.find(
            (element) => element === otherViewport
          )
        }
      )

      this._applyDeltaShiftToSelectedViewportCameras(
        renderingEngine,
        viewportsToolDataToUpdate,
        delta
      )
    } else if (handles.activeOperation > 0) {
      // ROTATION
      const otherViewportToolData = this._filterViewportOrientations(
        enabledElement,
        toolState
      )

      const scene = renderingEngine.getScene(viewportToolData.data.sceneUID)

      const viewportsToolDataToUpdate = otherViewportToolData.filter(
        (toolData) => {
          const { data } = toolData
          const otherScene = renderingEngine.getScene(data.sceneUID)
          const otherViewport = otherScene.getViewport(data.viewportUID)
          const otherViewportControllable = this._getReferenceLineControllable(
            otherViewport.uid
          )

          return scene === otherScene && otherViewportControllable === true
        }
      )

      const dir1 = vec2.create()
      const dir2 = vec2.create()

      const center = this.toolCenter
      const centerCanvas = viewport.worldToCanvas(center)

      const finalPointCanvas = eventData.currentPoints.canvas
      const originalPointCanvas = vec2.create()
      vec2.sub(
        originalPointCanvas,
        finalPointCanvas,
        eventData.deltaPoints.canvas
      )
      vec2.sub(dir1, originalPointCanvas, centerCanvas)
      vec2.sub(dir2, finalPointCanvas, centerCanvas)

      let angle = vec2.angle(dir1, dir2)

      if (
        this._isClockWise(centerCanvas, originalPointCanvas, finalPointCanvas)
      ) {
        angle *= -1
      }

      const rotationAxis = viewport.getCamera().viewPlaneNormal
      const { matrix } = vtkMatrixBuilder
        .buildFromRadian()
        .translate(center[0], center[1], center[2])
        .rotate(angle, rotationAxis)
        .translate(-center[0], -center[1], -center[2])

      // update camera for the other viewports.
      // NOTE: The lines then are rendered by the onCameraModified
      viewportsToolDataToUpdate.forEach((toolData) => {
        const { data } = toolData

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

        otherViewport.render()
      })
    }

    // TODO -> add modify slab thickness
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
      const { data } = toolData

      const scene = renderingEngine.getScene(data.sceneUID)
      const otherViewport = scene.getViewport(data.viewportUID)
      const camera = otherViewport.getCamera()
      const normal = camera.viewPlaneNormal

      // Project delta over camera normal
      // (we don't need to pan, we need only to scroll the camera as in the wheel stack scroll tool)
      const dotProd = vtkMath.dot(delta, normal)
      const cameraNorm2 = Math.pow(
        Math.sqrt(
          normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]
        ),
        2
      )
      const projectedDelta = [...normal]
      vtkMath.multiplyScalar(projectedDelta, dotProd / cameraNorm2)

      if (
        Math.abs(projectedDelta[0]) > 1e-3 ||
        Math.abs(projectedDelta[1]) > 1e-3 ||
        Math.abs(projectedDelta[2]) > 1e-3
      ) {
        const newFocalPoint = [0, 0, 0],
          newPosition = [0, 0, 0]

        vtkMath.add(camera.focalPoint, projectedDelta, newFocalPoint)
        vtkMath.add(camera.position, projectedDelta, newPosition)

        otherViewport.setCamera({
          focalPoint: newFocalPoint,
          position: newPosition,
        })

        otherViewport.render()
      }
    })
  }
}
