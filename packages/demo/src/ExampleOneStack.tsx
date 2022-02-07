import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  init as csRenderInit,
  getShouldUseCPURendering,
  metaData,
  cpuColormaps,
} from '@precisionmetrics/cornerstone-render'
import * as cs from '@precisionmetrics/cornerstone-render'
import { ToolBindings } from '@precisionmetrics/cornerstone-tools'
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

const toolsToUse = ['WindowLevel', 'Pan', 'Zoom', ...ANNOTATION_TOOLS].filter(
  (tool) => tool !== 'Crosshairs'
)

const availableStacks = ['ct', 'dx', 'color']

class OneStackExample extends Component {
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
    ptCtLeftClickTool: 'WindowLevel',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    currentStack: 'ct',
    cpuFallback: false,
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
      undefined,
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

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)

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

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  resetToolModes = (toolGroup) => {
    ANNOTATION_TOOLS.forEach((toolName) => {
      toolGroup.setToolPassive(toolName)
    })
    toolGroup.setToolActive('WindowLevel', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    })
    toolGroup.setToolActive('Pan', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Auxiliary }],
    })
    toolGroup.setToolActive('Zoom', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Secondary }],
    })
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    this.resetToolModes(stackCTViewportToolGroup)

    const tools = Object.entries(stackCTViewportToolGroup.toolOptions)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.length &&
        bindings.some(
          (binding) => binding.mouseButton === ToolBindings.Mouse.Primary
        )
    )

    stackCTViewportToolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings =
      stackCTViewportToolGroup.toolOptions[toolName].bindings

    stackCTViewportToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        { mouseButton: ToolBindings.Mouse.Primary },
      ],
    })

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  flipViewportHorizontal = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const { flipHorizontal } = vp.getProperties()
    vp.setProperties({ flipHorizontal: !flipHorizontal })
    vp.render()
  }

  flipViewportVertical = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const { flipVertical } = vp.getProperties()
    vp.setProperties({ flipVertical: !flipVertical })
    vp.render()
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

  rotateViewport = (rotateDeg) => {
    // remove all children
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const { rotation } = vp.getProperties()
    vp.setProperties({ rotation: rotation + rotateDeg })
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

  switchStack = (evt) => {
    const stackName = evt.target.value

    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    vp.setStack(this.stacks[stackName], 0).then(() => {
      vp.resetProperties()
    })

    this.setState({ currentStack: stackName })
  }

  resetViewportProperties = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.resetProperties()
    vp.resetCamera()
    vp.render()
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
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {toolsToUse.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>

        <select value={this.state.currentStack} onChange={this.switchStack}>
          {availableStacks.map((stackName) => (
            <option key={stackName} value={stackName}>
              {stackName}
            </option>
          ))}
        </select>
        <button
          onClick={() => this.resetViewportProperties()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Reset Properties
        </button>
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
          Rotate CW
        </button>
        <button
          onClick={() => this.rotateViewport(-90)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Rotate CCW
        </button>
        <button
          onClick={() => this.flipViewportHorizontal()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Horizontal Flip
        </button>
        <button
          onClick={() => this.flipViewportVertical()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Vertical Flip
        </button>

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

export default OneStackExample
