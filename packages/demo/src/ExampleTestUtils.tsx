import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  registerImageLoader,
  metaData,
  VIEWPORT_TYPE,
  Utilities,
} from '@ohif/cornerstone-render'
import {
  SynchronizerManager,
  ToolGroupManager,
  ToolBindings,
  resetToolsState,
} from '@ohif/cornerstone-tools'
import * as csTools3d from '@ohif/cornerstone-tools'

import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'

const VOLUME = 'volume'
const STACK = 'stack'

window.cache = cache


const { fakeImageLoader, fakeMetaDataProvider } = Utilities.testUtils

let stackCTViewportToolGroup

const toolsToUse = ANNOTATION_TOOLS.filter(
  (tool) => tool !== 'Crosshairs'
)
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class testUtil extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 1,
      numRows: 1,
      viewports: [{}],
    },
    ptCtLeftClickTool: 'Levels',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._canvasNodes = new Map()
    this._offScreenRef = React.createRef()
    this._viewportGridRef = React.createRef()

    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)


    this.ctStackImageIdsPromise = ['fakeImageLoader:imageURI_64_64_10_5_1_1_0']

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

    ({ stackCTViewportToolGroup } = initToolGroups())

    const ctStackImageIds = await this.ctStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          background: [1, 0, 1],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    addToolsToToolGroups({ stackCTViewportToolGroup })
    // This will initialise volumes in GPU memory
    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    await ctStackViewport.setStack(
      sortImageIdsByIPP(ctStackImageIds),
      ctMiddleSlice,
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

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false
    const options = {
      bindings: [ { mouseButton: ToolBindings.Mouse.Primary } ],
    }
    if (isAnnotationToolOn) {
      // Set tool active

      const toolsToSetPassive = toolsToUse.filter((name) => name !== toolName)
      stackCTViewportToolGroup.setToolActive(toolName, options)
      toolsToSetPassive.forEach((toolName) => {
        stackCTViewportToolGroup.setToolPassive(toolName)
      })

      stackCTViewportToolGroup.setToolDisabled('WindowLevel')
    } else {
      // Set window level + threshold
      stackCTViewportToolGroup.setToolActive('WindowLevel', options)

      // Set all annotation tools passive
      toolsToUse.forEach((toolName) => {
        stackCTViewportToolGroup.setToolPassive(toolName)
      })
    }

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
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

  rotateViewport = (rotateDeg) => {
    // remove all childs
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.setRotation(rotateDeg)
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Test Stack Render ({this.state.progressText})</h2>
            <p>The purpose of this demo is to render the stack test data that we utilize in testing</p>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
          </div>
        </div>
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {ctLayoutTools.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>

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
                background: 'black',
              }}
              key={i}
            >
              <canvas ref={(c) => this._canvasNodes.set(i, c)} />
            </div>
          ))}
        </ViewportGrid>
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

export default testUtil
