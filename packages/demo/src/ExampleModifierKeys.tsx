import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  ORIENTATION,
  VIEWPORT_TYPE,
} from '@ohif/cornerstone-render'
import {
  SynchronizerManager,
  ToolGroupManager,
  ToolBindings,
  resetToolsState,
} from '@ohif/cornerstone-tools'
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

let stackCTViewportToolGroup

const toolsToUse = ['WindowLevel', 'Pan', 'Zoom', ...ANNOTATION_TOOLS].filter(
  (tool) => tool !== 'Crosshairs'
)

class ModifierKeysExample extends Component {
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
  }

  constructor(props) {
    super(props)

    this._canvasNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)
    this.dxStackImageIdsPromise = getImageIds('dx', STACK)

    Promise.all([
      this.ctStackImageIdsPromise,
      this.dxStackImageIdsPromise,
    ]).then(() => this.setState({ progressText: 'Loading data...' }))

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
    ;({ stackCTViewportToolGroup } = initToolGroups())

    const ctStackImageIds = await this.ctStackImageIdsPromise
    const dxStackImageIds = await this.dxStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(0),
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

    // Overriding the lenght tool bindings
    stackCTViewportToolGroup.setToolActive('Length', {
      bindings: [
        {
          mouseButton: ToolBindings.Mouse.Primary,
          modifierKey: ToolBindings.Keyboard.Shift,
        },
      ],
    })

    // To enable the modifier keys cursor on viewport before first interaction
    document.querySelectorAll('div.viewport-pane > canvas')[0].focus()

    // This will initialise volumes in GPU memory
    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    this.ctStackViewport = ctStackViewport

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)

    this.dxStackImageIds = dxStackImageIds
    this.ctStackImageIds = ctStackImageIds

    let fakeStack = [
      ctStackImageIds[ctMiddleSlice],
      ctStackImageIds[ctMiddleSlice + 1],
      ctStackImageIds[ctMiddleSlice + 2],
    ]

    ctStackViewport.setStack(fakeStack, 0)
    ctStackViewport.setProperties({ voiRange: { lower: -160, upper: 240 } })

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this
    const onLoad = () => this.setState({ progressText: 'Loaded.' })
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    // Destroy synchronizers
    resetToolsState()
    SynchronizerManager.destroy()
    cache.purgeCache()
    ToolGroupManager.destroy()

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

    const tools = Object.entries(stackCTViewportToolGroup.tools)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.some(
          (binding) =>
            binding.mouseButton === ToolBindings.Mouse.Primary &&
            binding.modifierKey === undefined
        )
    )
    stackCTViewportToolGroup.setToolPassive(activeTool)

    // Since disabling/passive tools makes the bindings to be []
    stackCTViewportToolGroup.setToolActive('Length', {
      bindings: [
        {
          mouseButton: ToolBindings.Mouse.Primary,
          modifierKey: ToolBindings.Keyboard.Shift,
        },
      ],
    })

    // Using mouse primary for the selected tool
    const currentBindings = stackCTViewportToolGroup.tools[toolName].bindings

    stackCTViewportToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        {
          mouseButton: ToolBindings.Mouse.Primary,
        },
      ],
    })

    this.renderingEngine.render()

    // To enable modifier key cursor before tool interaction
    // Should be changed after canvas is wrapped in a div and keyboard event
    // listener is added to the div instead of canvas
    document.querySelectorAll("div.viewport-pane > canvas")[0].focus()

    this.setState({ ptCtLeftClickTool: toolName })
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

  switchStack = () => {
    // switch to a random new stack
    let fakeStack = [...this.dxStackImageIds, ...this.ctStackImageIds]
      .map((a) => ({ sort: Math.random(), value: a }))
      .sort((a, b) => a.sort - b.sort)
      .map((a) => a.value)
      .slice(0, 8)

    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    vp.setStack(fakeStack, 0)
    vp.resetProperties()
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
            <h2>Modifier keys ({this.state.progressText})</h2>
            <h4>Hold Shift+left click to have legnth activate on any tool</h4>
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

        <button
          onClick={() => this.switchStack()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Switch Stack
        </button>

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
                border: '2px solid grey',
                background: 'black',
              }}
              key={i}
            >
              <canvas tabIndex={-1} ref={(c) => this._canvasNodes.set(i, c)} />
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

export default ModifierKeysExample
