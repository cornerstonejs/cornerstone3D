import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  metaData,
  ORIENTATION,
  VIEWPORT_TYPE,
  INTERPOLATION_TYPE,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'
import {
  SynchronizerManager,
  synchronizers,
  ToolGroupManager,
  ToolBindings,
  resetToolsState,
  CornerstoneTools3DEvents,
  cancelActiveManipulations,
  removeToolStateByToolDataUID,
} from '@ohif/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, destroyToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ptVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  PET_CT_ANNOTATION_TOOLS,
} from './constants'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import * as cs from '@ohif/cornerstone-render'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'

import { registerWebImageLoader } from '@ohif/cornerstone-image-loader-streaming-volume'
import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'
import getToolDetailForDisplay from './helpers/getToolDetailForDisplay'

const VOLUME = 'volume'
const STACK = 'stack'

window.cache = cache

let ctSceneToolGroup,
  stackCTViewportToolGroup,
  stackPTViewportToolGroup,
  stackDXViewportToolGroup,
  ptSceneToolGroup

const toolsToUse = PET_CT_ANNOTATION_TOOLS.filter(
  (tool) => tool !== 'Crosshairs'
)
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class StackViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    leftClickTool: 'WindowLevel',
    layoutIndex: 0,
    destroyed: false,
    measurementsAdded: [],
    measurementsRemoved: [],
    cancelledMeasurements: null,
    measurementsModified: new Map(),
    showMeasurementEvents: false,
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

    registerWebImageLoader(cs)
    this._canvasNodes = new Map()
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

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      // stack CT
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      // pt volume
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(4),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 1],
        },
      },
      // dx
      // {
      //   viewportUID: VIEWPORT_IDS.STACK.DX,
      //   type: VIEWPORT_TYPE.STACK,
      //   canvas: this._canvasNodes.get(4),
      //   defaultOptions: {
      //     orientation: ORIENTATION.AXIAL,
      //   },
      // },
      // PT stack
      {
        viewportUID: VIEWPORT_IDS.STACK.PT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(5),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    )

    // pt volume axial
    ptSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.PT,
      VIEWPORT_IDS.PT.AXIAL
    )
    ptSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.PT,
      VIEWPORT_IDS.PT.SAGITTAL
    )

    // stack ct, stack pet, and stack DX
    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    // stackDXViewportToolGroup.addViewports(
    //   renderingEngineUID,
    //   undefined,
    //   VIEWPORT_IDS.STACK.DX
    // )

    stackPTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.PT
    )

    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    await ctStackViewport.setStack(
      sortImageIdsByIPP(ctStackImageIds),
      ctMiddleSlice
    )

    ctStackViewport.setProperties({
      voi: { lower: -160, upper: 240 },
      interpolationType: INTERPOLATION_TYPE.NEAREST,
    })

    const ptStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.PT)

    const ptMiddleSlice = Math.floor(ptStackImageIds.length / 2)
    await ptStackViewport.setStack(
      sortImageIdsByIPP(ptStackImageIds),
      ptMiddleSlice
    )

    ptStackViewport.setProperties({ invert: true, voi: { lower: 0, upper: 5 } })

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
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
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

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    ctScene.setVolumes([
      {
        volumeUID: ctVolumeUID,
        callback: setCTWWWC,
      },
    ])

    const ptScene = renderingEngine.getScene(SCENE_IDS.PT)
    ptScene.setVolumes([
      {
        volumeUID: ptVolumeUID,
        callback: setPetTransferFunction,
      },
    ])

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
      CornerstoneTools3DEvents.MEASUREMENT_ADDED,
      this.updateMeasurementAdded
    )
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.MEASUREMENT_MODIFIED,
      this.updateMeasurementModified
    )
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.MEASUREMENT_REMOVED,
      this.updateMeasurementRemoved
    )
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.KEY_DOWN,
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

    // Destroy synchronizers
    // SynchronizerManager.destroy()
    resetToolsState()
    cache.purgeCache()
    ToolGroupManager.destroy()

    this.renderingEngine.destroy()
  }

  cancelToolDrawing = (evt) => {
    const element = evt.currentTarget
    if (evt.code === 'Escape') {
      const toolDataUID = cancelActiveManipulations(element)
      if (!!toolDataUID) {
        this.setState({ cancelledMeasurements: toolDataUID })

        if (this.state.deleteOnToolCancel) {
          removeToolStateByToolDataUID(element, toolDataUID)
          this.renderingEngine.render()
        }
      }
    }
  }

  updateMeasurementAdded = (evt) => {
    const { toolData, viewportUID } = evt.detail

    const { metadata } = toolData
    const detail = {
      viewportUID,
      toolName: metadata.toolName,
      toolId: metadata.toolDataUID,
    }
    this.setState({
      measurementsAdded: [...this.state.measurementsAdded, detail],
    })
  }

  updateMeasurementRemoved = (evt) => {
    const { toolData, viewportUID } = evt.detail

    const { metadata } = toolData
    const detail = {
      viewportUID,
      toolName: metadata.toolName,
      toolId: metadata.toolDataUID,
    }
    this.setState({
      measurementsRemoved: [...this.state.measurementsRemoved, detail],
    })
  }

  updateMeasurementModified = (evt) => {
    const eventDetail = evt.detail

    const toolDisplayDetail = getToolDetailForDisplay(eventDetail)
    this.setState((prevState) => {
      const nextState = new Map(prevState.measurementsModified)
      const nextEntry = {
        ...nextState.get(toolDisplayDetail.toolId),
        toolDisplayDetail,
      }

      return {
        measurementsModified: nextState.set(
          toolDisplayDetail.toolId,
          nextEntry
        ),
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

  hidOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false
    const options = {
      bindings: [ToolBindings.Mouse.Primary],
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

      ctSceneToolGroup.setToolDisabled('WindowLevel')
      ptSceneToolGroup.setToolDisabled('PetThreshold')
      stackCTViewportToolGroup.setToolDisabled('WindowLevel')
      stackPTViewportToolGroup.setToolDisabled('PetThreshold')
      stackDXViewportToolGroup.setToolDisabled('WindowLevel')
    } else {
      // Set window level + threshold
      ctSceneToolGroup.setToolActive('WindowLevel', options)
      ptSceneToolGroup.setToolActive('PetThreshold', options)
      stackCTViewportToolGroup.setToolActive('WindowLevel', options)
      stackPTViewportToolGroup.setToolActive('PetThreshold', options)
      stackDXViewportToolGroup.setToolActive('WindowLevel', options)

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
    vp.setProperties({ voi: { lower: 100, upper: 500 } })
    vp.render()
  }

  render() {
    return (
      <div>
        <div>
          <h1>Stack Viewport Example (setViewports API)</h1>
          <p>
            This is a demo for volume viewports (Top row) and stack viewports
            (bottom) using the same rendering engine
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
                showMeasurementEvents: !this.state.showMeasurementEvents,
              })
            }
          />
          <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
            Show measurement events
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
            Delete Measurement on Tool Cancellation via Esc
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
                className="viewport-pane"
                style={{
                  ...(vp.cellStyle || {}),
                  border: '2px solid grey',
                  background: 'black',
                }}
                key={i}
              >
                <canvas
                  tabIndex={-1}
                  ref={(c) => this._canvasNodes.set(i, c)}
                  onKeyDown={(evt) => this.cancelToolDrawing(evt)}
                />
              </div>
            ))}
          </ViewportGrid>
        </div>
        <div>
          {this.state.showMeasurementEvents && (
            <div style={{ display: 'flex' }}>
              <div style={{ width: '33.33%' }}>
                <h3>Measurement Added</h3>
                <div>
                  {this.state.measurementsAdded[0] &&
                    this.state.measurementsAdded.map((m, index) => {
                      return (
                        <div key={index}>
                          <h4>{`${m.toolName} -- ${m.toolId.substring(
                            0,
                            5
                          )}`}</h4>
                          <p>{`viewportUID: ${m.viewportUID}`}</p>
                          <hr></hr>
                          <hr></hr>
                        </div>
                      )
                    })}
                </div>
              </div>

              <div style={{ width: '33.33%' }}>
                <h3>Measurement Modified</h3>
                <div>
                  {this.state.measurementsModified.size
                    ? [...this.state.measurementsModified.keys()].map(
                        (id, index) => {
                          const value =
                            this.state.measurementsModified.get(
                              id
                            ).toolDisplayDetail
                          return (
                            <div key={index}>
                              <h4>{`${value.toolName} -- ${id.substring(
                                0,
                                5
                              )}`}</h4>
                              <p>{`viewportUID: ${value.viewportUID}`}</p>
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
                <h3>Measurement Removed</h3>
                <div>
                  {this.state.measurementsRemoved[0] &&
                    this.state.measurementsRemoved.map((m, index) => {
                      return (
                        <div key={index}>
                          <h4>{`${m.toolName} -- ${m.toolId.substring(
                            0,
                            5
                          )}`}</h4>
                          <p>{`viewportUID: ${m.viewportUID}`}</p>
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
                  {this.state.cancelledMeasurements && (
                    <h4>{this.state.cancelledMeasurements.substring(0, 5)}</h4>
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
            onClick={this.hidOffScreenCanvas}
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
