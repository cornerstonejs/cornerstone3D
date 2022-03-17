import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  init as csRenderInit,
  getShouldUseCPURendering,
  metaData,
} from '@precisionmetrics/cornerstone-render'
import * as cs from '@precisionmetrics/cornerstone-render'
import {
  Cursors,
  WindowLevelTool,
  PanTool,
  CrosshairsTool,
  ZoomTool,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'
import { registerWebImageLoader } from '@precisionmetrics/cornerstone-image-loader-streaming-volume'
import config from './config/default'
import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import { renderingEngineUID, VIEWPORT_IDS, ANNOTATION_TOOLS } from './constants'

const STACK = 'stack'

window.cache = cache

let stackCTViewportToolGroup

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  ...ANNOTATION_TOOLS,
].filter((tool) => tool !== CrosshairsTool.toolName)

const availableStacks = ['ct', 'dx', 'color']

class CursorExample extends Component {
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
    cursorName: WindowLevelTool.toolName,
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    currentStack: 'ct',
    cpuFallback: false,
    cursorNames: [],
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)
    this.dxStackImageIdsPromise = getImageIds('dx', STACK)

    Promise.all([
      this.ctStackImageIdsPromise,
      this.dxStackImageIdsPromise,
    ]).then(() => this.setState({ progressText: 'Loading data...' }))
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    registerWebImageLoader(cs)

    this.setState({ cursorNames: Cursors.cursorNames })
    ;({ stackCTViewportToolGroup } = initToolGroups())

    const ctStackImageIds = await this.ctStackImageIdsPromise
    const dxStackImageIds = await this.dxStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    const colorImageIds = config.colorImages.imageIds

    metaData.addProvider(
      (type, imageId) =>
        hardcodedMetaDataProvider(type, imageId, colorImageIds),
      10000
    )

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        element: this._elementNodes.get(0),
        defaultOptions: {
          background: [0.2, 0, 0.2],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      VIEWPORT_IDS.STACK.CT
    )

    addToolsToToolGroups({ stackCTViewportToolGroup })

    // This will initialise volumes in GPU memory
    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    this.ctStackViewport = ctStackViewport

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    const colorMiddleSlice = Math.floor(colorImageIds.length / 2)

    this.dxStackImageIds = dxStackImageIds
    this.ctStackImageIds = ctStackImageIds

    const stacks = {
      ct: [
        ctStackImageIds[ctMiddleSlice],
        ctStackImageIds[ctMiddleSlice + 1],
        ctStackImageIds[ctMiddleSlice + 2],
      ],
      dx: [dxStackImageIds[0], dxStackImageIds[1]],
      color: [
        colorImageIds[colorMiddleSlice],
        colorImageIds[colorMiddleSlice + 1],
      ],
    }

    this.stacks = stacks

    await ctStackViewport.setStack(stacks.ct, 0)
    ctStackViewport.setProperties({
      voiRange: { lower: -1000, upper: 240 },
    })

    this.setState({ cpuFallback: getShouldUseCPURendering() })
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this
    const onLoad = () => this.setState({ progressText: 'Loaded.' })
  }

  componentWillUnmount() {
    cache.purgeCache()
    csTools3d.destroy()

    this.renderingEngine.destroy()
  }

  switchStack = (evt) => {
    const stackName = evt.target.value

    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    vp.setStack(this.stacks[stackName], 0).then(() => {
      vp.resetProperties()
    })

    this.setState({ currentStack: stackName })
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>
              One Stack Viewport Example{' '}
              {this.state.cpuFallback === true
                ? '(using CPU Fallback)'
                : '(using GPU)'}{' '}
              ({this.state.progressText})
            </h2>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        <span>Cursor names: </span>
        <select
          value={this.state.cursorName}
          onChange={(evt) => {
            const element = this._elementNodes.get(0)
            const cursorName = evt.target.value
            this.setState({ cursorName })
            Cursors.setCursorForElement(element, cursorName)
          }}
        >
          {this.state.cursorNames.map((cursorName) => (
            <option key={cursorName} value={cursorName}>
              {cursorName}
            </option>
          ))}
        </select>

        {this.state.viewportGrid.viewports.map((vp, i) => (
          <div
            style={{
              width: '512px',
              height: '812px',
            }}
            ref={(c) => this._elementNodes.set(i, c)}
            onContextMenu={(e) => e.preventDefault()}
            key={i}
          />
        ))}
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

export default CursorExample
