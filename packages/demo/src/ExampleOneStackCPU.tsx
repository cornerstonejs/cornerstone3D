import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  Enums,
  setUseCPURendering,
  init as csRenderInit,
  metaData,
  cpuColormaps,
} from '@precisionmetrics/cornerstone-render'
import * as cs from '@precisionmetrics/cornerstone-render'
import {
  ToolBindings,
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
const { ORIENTATION, VIEWPORT_TYPE } = Enums

let stackCTViewportToolGroup, stackPTViewportToolGroup

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  ...ANNOTATION_TOOLS,
].filter((tool) => tool !== CrosshairsTool.toolName)

const availableStacks = ['ct', 'pt', 'dx', 'color']

class OneStackExampleCPU extends Component {
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
    ptCtLeftClickTool: WindowLevelTool.toolName,
    currentStack: 'ct',
    falseColor: false,
    activeToolGroup: null,
  }

  constructor(props) {
    super(props)

    setUseCPURendering(true)
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)
    this.ptStackImageIdsPromise = getImageIds('pt1', STACK)
    this.dxStackImageIdsPromise = getImageIds('dx', STACK)

    Promise.all([
      this.ctStackImageIdsPromise,
      this.ptStackImageIdsPromise,
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
    await csRenderInit()
    csTools3d.init()
    registerWebImageLoader(cs)
    ;({ stackCTViewportToolGroup, stackPTViewportToolGroup } = initToolGroups())

    const ctStackImageIds = await this.ctStackImageIdsPromise
    const ptStackImageIds = await this.ptStackImageIdsPromise
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

    stackCTViewportToolGroup.addViewport(
      VIEWPORT_IDS.STACK.CT,
      renderingEngineUID
    )

    addToolsToToolGroups({
      stackCTViewportToolGroup,
      stackPTViewportToolGroup,
    })

    // This will initialise volumes in GPU memory
    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    this.ctStackViewport = ctStackViewport

    const ctMiddleSlice = Math.floor(ctStackImageIds.length / 2)
    const ptMiddleSlice = Math.floor(ptStackImageIds.length / 2)
    const colorMiddleSlice = Math.floor(colorImageIds.length / 2)

    this.dxStackImageIds = dxStackImageIds
    this.ctStackImageIds = ctStackImageIds
    this.ptStackImageIds = ptStackImageIds

    const stacks = {
      ct: [
        ctStackImageIds[ctMiddleSlice],
        ctStackImageIds[ctMiddleSlice + 1],
        ctStackImageIds[ctMiddleSlice + 2],
      ],
      pt: [
        ptStackImageIds[ptMiddleSlice],
        ptStackImageIds[ptMiddleSlice + 1],
        ptStackImageIds[ptMiddleSlice + 2],
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
      voiRange: { lower: -160, upper: 240 },
      // interpolationType: INTERPOLATION_TYPE.NEAREST,
    })

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._elementNodes.get(0))
    this.setState({ activeToolGroup: stackCTViewportToolGroup })
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

  resetToolModes = (toolGroup, stackName) => {
    ANNOTATION_TOOLS.forEach((toolName) => {
      toolGroup.setToolPassive(toolName)
    })

    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    })
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Auxiliary }],
    })
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Secondary }],
    })
  }

  swapTools = (evt) => {
    let toolName = evt.target.value
    const { activeToolGroup, currentStack } = this.state

    this.resetToolModes(activeToolGroup, this.state.currentStack)

    const tools = Object.entries(activeToolGroup.toolOptions)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.length &&
        bindings.some(
          (binding) => binding.mouseButton === ToolBindings.Mouse.Primary
        )
    )

    activeToolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings = activeToolGroup.toolOptions[toolName].bindings

    activeToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        { mouseButton: ToolBindings.Mouse.Primary },
      ],
    })

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  rotateViewport = (rotateDeg) => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const { rotation } = vp.getProperties()

    vp.setProperties({ rotation: rotation + rotateDeg })
    vp.render()
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

  resetCamera = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.resetCamera()
    vp.render()
  }

  invertColors = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const invert = vp.invert
    vp.setProperties({ invert: !invert })
    vp.render()
  }

  applyPreset = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    if (this.currentStack === 'pt') {
      vp.setProperties({ voiRange: { lower: 0, upper: 5 } })
    } else {
      vp.setProperties({ voiRange: { lower: 100, upper: 500 } })
    }

    vp.render()
  }

  switchStack = (evt) => {
    const stackName = evt.target.value

    stackCTViewportToolGroup.removeViewports(renderingEngineUID)
    stackPTViewportToolGroup.removeViewports(renderingEngineUID)

    let activeToolGroup
    if (stackName === 'pt') {
      activeToolGroup = stackPTViewportToolGroup
      activeToolGroup.addViewport(VIEWPORT_IDS.STACK.CT, renderingEngineUID)
    } else {
      activeToolGroup = stackCTViewportToolGroup
      activeToolGroup.addViewport(VIEWPORT_IDS.STACK.CT, renderingEngineUID)
    }

    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    vp.setStack(this.stacks[stackName], 0).then(() => {
      vp.resetProperties()
      if (stackName === 'pt') {
        vp.setProperties({
          voiRange: { lower: 0, upper: 5 },
          invert: true,
        })
      }
    })

    this.resetToolModes(activeToolGroup, stackName)

    this.setState({
      currentStack: stackName,
      falseColor: false,
      activeToolGroup,
      ptCtLeftClickTool: WindowLevelTool.toolName, // reset ui
    })
  }

  resetViewportProperties = () => {
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.resetProperties()
    vp.resetCamera()
    vp.render()
  }

  toggleFalseColor = () => {
    const falseColor = !this.state.falseColor

    // TODO toggle vp state

    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    if (falseColor) {
      vp.setColormap(cpuColormaps.hotIron)
    } else {
      vp.unsetColormap()
    }

    this.setState({ falseColor })
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>
              One Stack CPU Fallback Viewport Example ({this.state.progressText}
              )
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
        {this.state.currentStack !== 'color' && (
          <button
            onClick={() => this.toggleFalseColor()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            {this.state.falseColor
              ? 'disable false color'
              : 'enable false color'}
          </button>
        )}
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
        <button
          onClick={() => this.resetCamera()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Reset Camera
        </button>

        {this.state.viewportGrid.viewports.map((vp, i) => (
          <div
            style={{
              width: '512px',
              height: '512px',
            }}
            ref={(c) => {
              this._elementNodes.set(i, c)
            }}
            onContextMenu={(e) => e.preventDefault()}
            key={i}
          />
        ))}
      </div>
    )
  }
}

export default OneStackExampleCPU
