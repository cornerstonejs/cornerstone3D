import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  Enums,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import {
  Enums as csToolsEnums,
  utilities,
  WindowLevelTool,
  PanTool,
  CrosshairsTool,
  ZoomTool,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import { setCTWWWC } from './helpers/transferFunctionHelpers'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import { renderingEngineUID, VIEWPORT_IDS, ANNOTATION_TOOLS } from './constants'

const STACK = 'stack'

window.cache = cache
const { ViewportType } = Enums

let stackDXViewportToolGroup

const { calibrateImageSpacing } = utilities

const toolsToUse = ANNOTATION_TOOLS.filter(
  (tool) => tool !== CrosshairsTool.toolName
)
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class CalibrationExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    calibrationX: 5,
    calibrationY: 10,
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
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.DXStackImageIdsPromise = getImageIds('dx', STACK)

    Promise.all([this.DXStackImageIdsPromise]).then(() =>
      this.setState({ progressText: 'Loading data...' })
    )

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
    ;({ stackDXViewportToolGroup } = initToolGroups())

    const DXStackImageIds = await this.DXStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        viewportUID: VIEWPORT_IDS.STACK.DX,
        type: ViewportType.STACK,
        element: this._elementNodes.get(0),
        defaultOptions: {
          background: [0, 0, 0],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    stackDXViewportToolGroup.addViewport(
      VIEWPORT_IDS.STACK.DX,
      renderingEngineUID
    )

    addToolsToToolGroups({ stackDXViewportToolGroup })
    // This will initialise volumes in GPU memory
    renderingEngine.render()

    const ctStackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.DX)

    const ctMiddleSlice = Math.floor(DXStackImageIds.length / 2)
    await ctStackViewport.setStack(
      sortImageIdsByIPP(DXStackImageIds),
      ctMiddleSlice,
      [setCTWWWC]
    )

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
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    })
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
    })
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
    })
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    this.resetToolModes(stackDXViewportToolGroup)

    const tools = Object.entries(stackDXViewportToolGroup.toolOptions)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.some(
          (binding) =>
            binding.mouseButton === csToolsEnums.MouseBindings.Primary &&
            binding.modifierKey === undefined
        )
    )
    stackDXViewportToolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings =
      stackDXViewportToolGroup.toolOptions[toolName].bindings

    stackDXViewportToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        {
          mouseButton: csToolsEnums.MouseBindings.Primary,
        },
      ],
    })

    this.renderingEngine.render()

    // To enable modifier key cursor before tool interaction
    // Should be changed after canvas is wrapped in a div and keyboard event
    // listener is added to the div instead of canvas

    this.setState({ ptCtLeftClickTool: toolName })
  }

  calibrateImage = () => {
    const imageId = this.renderingEngine
      .getViewport('dxStack')
      .getCurrentImageId()

    calibrateImageSpacing(
      imageId,
      this.renderingEngine,
      this.state.calibrationX,
      this.state.calibrationY
    )
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Calibration Example({this.state.progressText})</h2>
            <h4>
              The original spacing of the X-ray is 2x2 mm, you can change the
              spacing and visualize how the image and drawn tools reflect the
              change{' '}
            </h4>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {ctLayoutTools.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>

        <input
          type="number"
          id="calibrationY"
          name="calibrationY"
          onClick={(ev) => {
            ev.target.focus()
            ev.target.select()
          }}
          style={{ margin: '2px 4px', float: 'right' }}
          autoComplete="off"
          value={this.state.calibrationY}
          placeholder="spacing in Y (mm)"
          onChange={(ev) =>
            this.setState({ calibrationY: parseFloat(ev.target.value) })
          }
        />
        <input
          type="number"
          id="calibrationX"
          name="calibrationX"
          onClick={(ev) => {
            ev.target.focus()
            ev.target.select()
          }}
          style={{ margin: '2px 4px', float: 'right' }}
          autoComplete="off"
          value={this.state.calibrationX}
          placeholder="spacing in X (mm)"
          onChange={(ev) =>
            this.setState({ calibrationX: parseFloat(ev.target.value) })
          }
        />
        <button
          onClick={() => this.calibrateImage()}
          className="btn btn-primary"
          style={{ margin: '2px 4px', float: 'right' }}
        >
          calibrate DX Image
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
    )
  }
}

export default CalibrationExample
