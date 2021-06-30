
import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  metaData,
  ORIENTATION,
  VIEWPORT_TYPE,
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
  removeToolStateByToolUID,
} from '@ohif/cornerstone-tools'

import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'


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
const { BlendMode } = vtkConstants

window.cache = cache

let ctSceneToolGroup,
  stackCTViewportToolGroup,
  stackPTViewportToolGroup,
  stackDXViewportToolGroup,
  ptSceneToolGroup

const toolsToUse = PET_CT_ANNOTATION_TOOLS
const ctLayoutTools = ['Levels'].concat(toolsToUse)
let viewportInput
class FlipViewportExample extends Component {
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
    selectedViewport: 0,
    //
    viewportGrid: {
      numCols: 2,
      numRows: 2,
      viewports: [{}, {}, {}, {}],
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
    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)

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
    const ctStackImageIds = await this.ctStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    viewportInput = [
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
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
      // stack CT
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(3),
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
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.CORONAL
    )

    // stack ct, stack pet, and stack DX
    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    await ctStackViewport.setStack(
      sortImageIdsByIPP(ctStackImageIds),
      ctMiddleSlice,
      [setCTWWWC]
    )

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    // for (let i = 0; i < ctLength; i++) {
    //   scalarData[i] = -1024
    // }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    ctScene.setVolumes([
      {
        volumeUID: ctVolumeUID,
        callback: setCTWWWC,
        blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND,
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

  showOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hidOffScreenCanvas = () => {
    // remove all childs
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
      stackCTViewportToolGroup.setToolActive(toolName, options)

      toolsToSetPassive.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
      })

      ctSceneToolGroup.setToolDisabled('WindowLevel')
      stackCTViewportToolGroup.setToolDisabled('WindowLevel')
    } else {
      // Set window level + threshold
      ctSceneToolGroup.setToolActive('WindowLevel', options)
      stackCTViewportToolGroup.setToolActive('WindowLevel', options)

      // Set all annotation tools passive
      toolsToUse.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
      })
    }

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  flip = (direction) => {
    const { viewportUID } = viewportInput[this.state.selectedViewport]
    const viewport = this.renderingEngine.getViewport(viewportUID)
    viewport.flip(direction)
  }

  render() {
    return (
      <div>
        <div>
          <h1>Flip Viewport Example </h1>
          <p>
            This is a demo for flipping viewports: viewports 1,2,3 are volume
            viewports and viewport 4 (bottom right) is stack viewport of the
            same volume
          </p>
        </div>
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

          <button
            onClick={() => this.flip(0)}
            className="btn btn-primary"
            style={{ margin: '2px 4px', float: 'right' }}
          >
            Flip Horizontally
          </button>
          <button
            onClick={() => this.flip(1)}
            className="btn btn-primary"
            style={{ margin: '2px 4px', float: 'right' }}
          >
            Flip Vertically
          </button>
          <select
            style={{ margin: '2px 4px', float: 'right' }}
            value={this.state.selectedViewport}
            onChange={(ev) =>
              this.setState({ selectedViewport: parseFloat(ev.target.value) })
            }
          >
            {[0, 1, 2, 3].map((id) => (
              <option key={id} value={id}>
                {`Viewport ${id}`}
              </option>
            ))}
          </select>
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
                />
              </div>
            ))}
          </ViewportGrid>
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

export default FlipViewportExample
