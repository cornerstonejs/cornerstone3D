import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  ORIENTATION,
  VIEWPORT_TYPE,
  init as cs3dInit,
  setVolumesOnViewports,
} from '@precisionmetrics/cornerstone-render'
import {
  ToolBindings,
  ToolModes,
  BlendModes,
  WindowLevelTool,
  PanTool,
  CrosshairsTool,
  ZoomTool,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ptVolumeUID,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
  prostateVolumeUID,
} from './constants'

const VOLUME = 'volume'

window.cache = cache

let ctSceneToolGroup, prostateSceneToolGroup

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  ...ANNOTATION_TOOLS,
]

class CrosshairsExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 2,
      viewports: [{}, {}, {}, {}, {}],
    },
    leftClickTool: WindowLevelTool.toolName,
    toolGroupName: 'FirstRow',
    toolGroups: {},
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.ctImageIds = getImageIds('ct1', VOLUME)
    this.prostateImageIds = getImageIds('prostateX', VOLUME)

    Promise.all([this.ctImageIds, this.prostateImageIds]).then(() =>
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
    await cs3dInit()
    ;({ ctSceneToolGroup, prostateSceneToolGroup } = initToolGroups())

    const ctImageIds = await this.ctImageIds
    const prostateImageIds = await this.prostateImageIds

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [0, 0, 0],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [0, 0, 0],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [0, 0, 0],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.PROSTATE.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [0, 0, 0],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.PROSTATE.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(4),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [0, 0, 0],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.AXIAL, renderingEngineUID)
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.SAGITTAL, renderingEngineUID)
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.CORONAL, renderingEngineUID)
    prostateSceneToolGroup.addViewport(
      renderingEngineUID,
      VIEWPORT_IDS.PROSTATE.AXIAL
    )
    prostateSceneToolGroup.addViewport(
      renderingEngineUID,
      VIEWPORT_IDS.PROSTATE.SAGITTAL
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      prostateSceneToolGroup,
    })

    window.ctSceneToolGroup = ctSceneToolGroup
    this.setState({
      toolGroups: {
        FirstRow: ctSceneToolGroup,
        SecondRow: prostateSceneToolGroup,
      },
    })

    renderingEngine.render()

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctImageIds,
    })
    const prostateVolume = await createAndCacheVolume(prostateVolumeUID, {
      imageIds: prostateImageIds,
    })

    ctVolume.load()
    prostateVolume.load()

    await setVolumesOnViewports(
      renderingEngine,
      [
        {
          volumeUID: ctVolumeUID,
          callback: setCTWWWC,
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        },
      ],
      [VIEWPORT_IDS.CT.AXIAL, VIEWPORT_IDS.CT.SAGITTAL, VIEWPORT_IDS.CT.CORONAL]
    )
    await setVolumesOnViewports(
      renderingEngine,
      [
        {
          volumeUID: prostateVolumeUID,
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        },
      ],
      [VIEWPORT_IDS.PROSTATE.AXIAL, VIEWPORT_IDS.PROSTATE.SAGITTAL]
    )

    // This will initialise volumes in GPU memory
    renderingEngine.render()

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

  setToolMode = (toolMode) => {
    const toolGroup = this.state.toolGroups[this.state.toolGroupName]
    if (toolMode === ToolModes.Active) {
      const activeTool = toolGroup.getActivePrimaryMouseButtonTool()
      if (activeTool) {
        toolGroup.setToolPassive(activeTool)
      }

      toolGroup.setToolActive(this.state.leftClickTool, {
        bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
      })
    } else if (toolMode === ToolModes.Passive) {
      toolGroup.setToolPassive(this.state.leftClickTool)
    } else if (toolMode === ToolModes.Enabled) {
      toolGroup.setToolEnabled(this.state.leftClickTool)
    } else if (toolMode === ToolModes.Disabled) {
      toolGroup.setToolDisabled(this.state.leftClickTool)
    }
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

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Crosshairs example ({this.state.progressText})</h2>
            <p>
              This demo demonstrates the use of crosshairs on two studies that
              don't share the same frameOfReference.
            </p>
            <p>
              Top row: CT scene from patient 1 and Bottom row: PET scene from
              patient2
            </p>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        <span>Set this tool </span>
        <select
          value={this.state.leftClickTool}
          onChange={(evt) => {
            this.setState({ leftClickTool: evt.target.value })
          }}
        >
          {toolsToUse.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <span style={{ marginLeft: '4px' }}>for this toolGroup </span>
        <select
          value={this.state.toolGroupName}
          onChange={(evt) => {
            this.setState({ toolGroupName: evt.target.value })
          }}
        >
          {Object.keys(this.state.toolGroups).map((toolGroupName) => (
            <option key={toolGroupName} value={toolGroupName}>
              {toolGroupName}
            </option>
          ))}
        </select>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Active)}
        >
          Active
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Passive)}
        >
          Passive
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Enabled)}
        >
          Enabled
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Disabled)}
        >
          Disabled
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
              }}
              ref={(c) => this._elementNodes.set(i, c)}
              onContextMenu={(e) => e.preventDefault()}
              key={i}
            />
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

export default CrosshairsExample
