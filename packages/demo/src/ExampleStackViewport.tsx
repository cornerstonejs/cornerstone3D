import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  volumeLoader,
  metaData,
  Enums,
  CONSTANTS,
  init as csRenderInit,
  setVolumesForViewports,
} from '@cornerstonejs/core'
import {
  Enums as csToolsEnums,
  synchronizers,
  cancelActiveManipulations,
  destroy as CS3dToolsDestroy,
  CrosshairsTool,
  WindowLevelTool,
} from '@cornerstonejs/tools'
import * as csTools3d from '@cornerstonejs/tools'
import '@cornerstonejs/streaming-image-volume-loader' // for loader to get registered

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineId,
  ctVolumeId,
  ptVolumeId,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import * as cs from '@cornerstonejs/core'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'

import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'
import getToolDetailForDisplay from './helpers/getToolDetailForDisplay'

const VOLUME = 'volume'
const STACK = 'stack'
const { ViewportType, InterpolationType } = Enums
const { ORIENTATION } = CONSTANTS

window.cache = cache

let ctSceneToolGroup,
  stackCTViewportToolGroup,
  stackPTViewportToolGroup,
  stackDXViewportToolGroup,
  ptSceneToolGroup

const toolsToUse = ANNOTATION_TOOLS.filter(
  (tool) => tool !== CrosshairsTool.toolName
)
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class StackViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    leftClickTool: WindowLevelTool.toolName,
    layoutIndex: 0,
    destroyed: false,
    annotationsAdded: [],
    annotationsRemoved: [],
    cancelledAnnotations: null,
    annotationsModified: new Map(),
    showAnnotationEvents: false,
    deleteOnToolCancel: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 2,
      viewports: [{}, {}, {}, {}, {}, {}],
    },
    ptCtLeftClickTool: 'Levels',

    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  }

  constructor(props) {
    super(props)

    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    this._offScreenRef = React.createRef()

    this.ctVolumeImageIdsPromise = getImageIds('ct1', VOLUME)
    this.ptVolumeImageIdsPromise = getImageIds('pt1', VOLUME)

    this.ctStackImageIdsPromise = getImageIds('dx', STACK)
    this.ptStackImageIdsPromise = getImageIds('pt1', STACK)
    this.dxImageIdsPromise = getImageIds('dx', STACK)

    this.colorImageIds = config.colorImages.imageIds
    this.testRenderImageIds = config.testRender.imageIds

    metaData.addProvider(
      (type, imageId) =>
        hardcodedMetaDataProvider(type, imageId, this.colorImageIds),
      10000
    )

    const { createCameraPositionSynchronizer, createVOISynchronizer } =
      synchronizers

    this.axialSync = createCameraPositionSynchronizer('axialSync')
    // this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    // this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    // this.ctWLSync = createVOISynchronizer('ctWLSync')
    // this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    ;({
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackPTViewportToolGroup,
      stackDXViewportToolGroup,
      ptSceneToolGroup,
    } = initToolGroups({
      configuration: { preventHandleOutsideImage: true },
    }))

    const ctVolumeImageIds = await this.ctVolumeImageIdsPromise
    const ptVolumeImageIds = await this.ptVolumeImageIdsPromise
    const colorImageIds = this.colorImageIds

    const dxImageIds = await this.dxImageIdsPromise
    const ctStackImageIds = await this.ctStackImageIdsPromise
    const ptStackImageIds = await this.ptStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineId)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        viewportId: VIEWPORT_IDS.CT.AXIAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.CT.SAGITTAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      // stack CT
      {
        viewportId: VIEWPORT_IDS.STACK.CT,
        type: ViewportType.STACK,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      // pt volume
      {
        viewportId: VIEWPORT_IDS.PT.AXIAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 1, 1],
        },
      },
      {
        viewportId: VIEWPORT_IDS.PT.SAGITTAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(4),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
      // dx
      // {
      //   viewportId: VIEWPORT_IDS.STACK.DX,
      //   type: ViewportType.STACK,
      //   element: this._elementNodes.get(4),
      //   defaultOptions: {
      //     orientation: ORIENTATION.AXIAL,
      //   },
      // },
      // PT stack
      {
        viewportId: VIEWPORT_IDS.STACK.PT,
        type: ViewportType.STACK,
        element: this._elementNodes.get(5),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.AXIAL, renderingEngineId)
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.SAGITTAL, renderingEngineId)

    // pt volume axial
    ptSceneToolGroup.addViewport(VIEWPORT_IDS.PT.AXIAL, renderingEngineId)
    ptSceneToolGroup.addViewport(VIEWPORT_IDS.PT.SAGITTAL, renderingEngineId)

    // stack ct, stack pet, and stack DX
    stackCTViewportToolGroup.addViewport(
      VIEWPORT_IDS.STACK.CT,
      renderingEngineId
    )

    // stackDXViewportToolGroup.addViewport(
    //   VIEWPORT_IDS.STACK.DX,
    //   renderingEngineId,
    // )

    stackPTViewportToolGroup.addViewport(
      VIEWPORT_IDS.STACK.PT,
      renderingEngineId
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackPTViewportToolGroup,
      stackDXViewportToolGroup,
      ptSceneToolGroup,
    })

    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    await ctStackViewport.setStack(
      sortImageIdsByIPP(ctStackImageIds),
      ctMiddleSlice
    )

    ctStackViewport.setProperties({
      voiRange: { lower: -160, upper: 240 },
      interpolationType: InterpolationType.LINEAR,
    })

    const ptStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.PT)

    const ptMiddleSlice = Math.floor(ptStackImageIds.length / 2)
    await ptStackViewport.setStack(
      sortImageIdsByIPP(ptStackImageIds),
      ptMiddleSlice
    )

    ptStackViewport.setProperties({
      invert: true,
      voiRange: { lower: 0, upper: 5 },
    })

    // ct + dx + color
    // const dxColorViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.DX)

    // let fakeStack = [
    //   dxImageIds[0],
    //   colorImageIds[0],
    //   dxImageIds[1],
    //   ctStackImageIds[40],
    //   colorImageIds[1],
    //   colorImageIds[2],
    //   ctStackImageIds[41],
    // ]
    // await dxColorViewport.setStack(fakeStack)

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
      imageIds: ctVolumeImageIds,
    })

    const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
      imageIds: ptVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    // for (let i = 0; i < ctLength; i++) {
    //   scalarData[i] = -1024
    // }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)
    ptVolume.load(onLoad)

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: ctVolumeId,
          callback: setCTWWWC,
        },
      ],
      [VIEWPORT_IDS.CT.AXIAL, VIEWPORT_IDS.CT.SAGITTAL]
    )

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: ptVolumeId,
          callback: setPetTransferFunction,
        },
      ],
      [VIEWPORT_IDS.PT.AXIAL, VIEWPORT_IDS.PT.SAGITTAL]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialise volumes in GPU memory
    renderingEngine.render()

    // add event listeners for tools
    eventTarget.addEventListener(
      csToolsEnums.Events.ANNOTATION_ADDED,
      this.updateAnnotationAdded
    )
    eventTarget.addEventListener(
      csToolsEnums.Events.ANNOTATION_MODIFIED,
      this.updateAnnotationModified
    )
    eventTarget.addEventListener(
      csToolsEnums.Events.ANNOTATION_REMOVED,
      this.updateAnnotationRemoved
    )
    eventTarget.addEventListener(
      csToolsEnums.Events.KEY_DOWN,
      this.cancelToolDrawing
    )

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()

    this.renderingEngine.destroy()
  }

  cancelToolDrawing = (evt) => {
    const element = evt.currentTarget
    if (evt.code === 'Escape') {
      const annotationUID = cancelActiveManipulations(element)
      if (!!annotationUID) {
        this.setState({ cancelledAnnotations: annotationUID })

        if (this.state.deleteOnToolCancel) {
          removeAnnotation(element, annotationUID)
          this.renderingEngine.render()
        }
      }
    }
  }

  updateAnnotationAdded = (evt) => {
    const { annotation, viewportId } = evt.detail

    const { metadata, annotationUID } = annotation
    const detail = {
      viewportId,
      toolName: metadata.toolName,
      toolId: annotationUID,
    }
    this.setState({
      annotationsAdded: [...this.state.annotationsAdded, detail],
    })
  }

  updateAnnotationRemoved = (evt) => {
    const { annotation, viewportId } = evt.detail

    const { metadata, annotationUID } = annotation
    const detail = {
      viewportId,
      toolName: metadata.toolName,
      toolId: annotationUID,
    }
    this.setState({
      annotationsRemoved: [...this.state.annotationsRemoved, detail],
    })
  }

  updateAnnotationModified = (evt) => {
    const eventDetail = evt.detail

    const toolDisplayDetail = getToolDetailForDisplay(eventDetail)
    this.setState((prevState) => {
      const nextState = new Map(prevState.annotationsModified)
      const nextEntry = {
        ...nextState.get(toolDisplayDetail.toolId),
        toolDisplayDetail,
      }

      return {
        annotationsModified: nextState.set(toolDisplayDetail.toolId, nextEntry),
      }
    })
  }

  showOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false
    const options = {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    }
    if (isAnnotationToolOn) {
      // Set tool active

      const toolsToSetPassive = toolsToUse.filter((name) => name !== toolName)

      ctSceneToolGroup.setToolActive(toolName, options)
      ptSceneToolGroup.setToolActive(toolName, options)
      stackCTViewportToolGroup.setToolActive(toolName, options)
      stackPTViewportToolGroup.setToolActive(toolName, options)
      stackDXViewportToolGroup.setToolActive(toolName, options)

      toolsToSetPassive.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        ptSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
        stackPTViewportToolGroup.setToolPassive(toolName)
        stackDXViewportToolGroup.setToolPassive(toolName)
      })

      ctSceneToolGroup.setToolDisabled(WindowLevelTool.toolName)
      ptSceneToolGroup.setToolDisabled(WindowLevelTool.toolName)
      stackCTViewportToolGroup.setToolDisabled(WindowLevelTool.toolName)
      stackPTViewportToolGroup.setToolDisabled(WindowLevelTool.toolName)
      stackDXViewportToolGroup.setToolDisabled(WindowLevelTool.toolName)
    } else {
      // Set window level + threshold
      ctSceneToolGroup.setToolActive(WindowLevelTool.toolName, options)
      ptSceneToolGroup.setToolActive(WindowLevelTool.toolName, options)
      stackCTViewportToolGroup.setToolActive(WindowLevelTool.toolName, options)
      stackPTViewportToolGroup.setToolActive(WindowLevelTool.toolName, options)
      stackDXViewportToolGroup.setToolActive(WindowLevelTool.toolName, options)

      // Set all annotation tools passive
      toolsToUse.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        ptSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
        stackPTViewportToolGroup.setToolPassive(toolName)
        stackDXViewportToolGroup.setToolPassive(toolName)
      })
    }

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  rotateViewport = (rotateDeg) => {
    // remove all children
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.setProperties({ rotation: rotateDeg })
    vp.render()
  }

  invertColors = () => {
    // remove all children
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const invert = vp.invert
    vp.setProperties({ invert: !invert })
    vp.render()
  }

  applyPreset = () => {
    // remove all children
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.setProperties({ voiRange: { lower: 100, upper: 500 } })
    vp.render()
  }

  render() {
    return (
      <div>
        <div>
          <h1>Stack Viewport Example(setViewports API)</h1>
          {!window.crossOriginIsolated ? (
            <h1 style={{ color: 'red' }}>
              This Demo requires SharedArrayBuffer but your browser does not
              support it
            </h1>
          ) : null}
          <p>
            This is a demo for rendering a stack and volume viewport together:
            Top row left and middle: Volume CT, Top row right: Stack DX; Bottom
            row left and middle Volume PET, Bottom row right: Stack PET.
          </p>
        </div>
        <button
          onClick={() => this.invertColors()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Invert Colors
        </button>
        <button
          onClick={() => this.applyPreset()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Apply Preset
        </button>
        <button
          onClick={() => this.rotateViewport(90)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Rotate = 90
        </button>
        <button
          onClick={() => this.rotateViewport(180)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Rotate = 180
        </button>
        <button
          onClick={() => this.rotateViewport(270)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Rotate = 270
        </button>
        <button
          onClick={() => this.rotateViewport(360)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Rotate = 360 OR 0
        </button>
        <div>
          <select
            value={this.state.ptCtLeftClickTool}
            onChange={this.swapTools}
          >
            {ctLayoutTools.map((toolName) => (
              <option key={toolName} value={toolName}>
                {toolName}
              </option>
            ))}
          </select>
          <input
            type="checkbox"
            style={{ marginLeft: '10px' }}
            name="toggle"
            onClick={() =>
              this.setState({
                showAnnotationEvents: !this.state.showAnnotationEvents,
              })
            }
          />
          <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
            Show annotation events
          </label>
          <input
            type="checkbox"
            style={{ marginLeft: '10px' }}
            name="toggle"
            onClick={() =>
              this.setState({
                deleteOnToolCancel: !this.state.deleteOnToolCancel,
              })
            }
          />
          <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
            Delete Annotation on Tool Cancellation via Esc
          </label>
        </div>
        <div style={{ paddingBottom: '55px' }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: '650px', marginTop: '35px' }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '2px solid grey',
                  background: 'black',
                  ...(vp.cellStyle || {}),
                }}
                ref={(c) => this._elementNodes.set(i, c)}
                onContextMenu={(e) => e.preventDefault()}
                key={i}
              />
            ))}
          </ViewportGrid>
        </div>
        <div>
          {this.state.showAnnotationEvents && (
            <div style={{ display: 'flex' }}>
              <div style={{ width: '33.33%' }}>
                <h3>Annotation Added</h3>
                <div>
                  {this.state.annotationsAdded[0] &&
                    this.state.annotationsAdded.map((m, index) => {
                      return (
                        <div key={index}>
                          <h4>{`${m.toolName} -- ${m.toolId.substring(
                            0,
                            5
                          )}`}</h4>
                          <p>{`viewportId: ${m.viewportId}`}</p>
                          <hr></hr>
                          <hr></hr>
                        </div>
                      )
                    })}
                </div>
              </div>

              <div style={{ width: '33.33%' }}>
                <h3>Annotation Modified</h3>
                <div>
                  {this.state.annotationsModified.size
                    ? [...this.state.annotationsModified.keys()].map(
                        (id, index) => {
                          const value =
                            this.state.annotationsModified.get(
                              id
                            ).toolDisplayDetail
                          return (
                            <div key={index}>
                              <h4>{`${value.toolName} -- ${id.substring(
                                0,
                                5
                              )}`}</h4>
                              <p>{`viewportId: ${value.viewportId}`}</p>
                              <div>
                                {Object.keys(value.stats).map((statName) => {
                                  return (
                                    <div key={statName}>
                                      <div>{`${statName}: ${value.stats[statName]}`}</div>
                                      <div>---------</div>
                                    </div>
                                  )
                                })}
                              </div>
                              <hr></hr>
                              <hr></hr>
                            </div>
                          )
                        }
                      )
                    : null}
                </div>
              </div>
              <div style={{ width: '15.3%' }}>
                <h3>Annotation Removed</h3>
                <div>
                  {this.state.annotationsRemoved[0] &&
                    this.state.annotationsRemoved.map((m, index) => {
                      return (
                        <div key={index}>
                          <h4>{`${m.toolName} -- ${m.toolId.substring(
                            0,
                            5
                          )}`}</h4>
                          <p>{`viewportId: ${m.viewportId}`}</p>
                          <hr></hr>
                          <hr></hr>
                        </div>
                      )
                    })}
                </div>
              </div>
              <div style={{ width: '15.3%' }}>
                <h3>Tool Cancelled</h3>
                <div>
                  {this.state.cancelledAnnotations && (
                    <h4>{this.state.cancelledAnnotations.substring(0, 5)}</h4>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hideOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    )
  }
}

export default StackViewportExample
