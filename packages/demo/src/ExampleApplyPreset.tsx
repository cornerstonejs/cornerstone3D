import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  volumeLoader,
  Enums,
  CONSTANTS,
  init,
  setVolumesForViewports,
} from '@precisionmetrics/cornerstone-render'
import {
  Enums as csToolsEnums,
  WindowLevelTool,
  PanTool,
  CrosshairsTool,
  ZoomTool,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import presets from './helpers/presets'
import applyPreset from './helpers/applyPreset'
import { setCTWWWC } from './helpers/transferFunctionHelpers'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'

const VOLUME = 'volume'
const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

window.cache = cache

let ctSceneToolGroup

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  ...ANNOTATION_TOOLS,
]

// get names inside presets array of objects
const presetNames = presets.map((preset) => preset.name)

class ApplyPresetExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 1,
      viewports: [{}, {}, {}],
    },
    ptCtLeftClickTool: WindowLevelTool.toolName,
    preset: '',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.volumeImageIds = getImageIds('ct1', VOLUME)

    Promise.all([this.volumeImageIds]).then(() =>
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
    await init()
    ;({ ctSceneToolGroup } = initToolGroups())

    const volumeImageIds = await this.volumeImageIds

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [165 / 255, 165 / 255, 215 / 255],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [165 / 255, 165 / 255, 215 / 255],
        },
      },
      {
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: ViewportType.ORTHOGRAPHIC,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [165 / 255, 165 / 255, 215 / 255],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.AXIAL, renderingEngineUID)
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.SAGITTAL, renderingEngineUID)
    ctSceneToolGroup.addViewport(VIEWPORT_IDS.CT.CORONAL, renderingEngineUID)

    addToolsToToolGroups({ ctSceneToolGroup })

    renderingEngine.render()

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeUID, {
      imageIds: volumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    // const { scalarData } = ctVolume
    // const ctLength = scalarData.length

    // for (let i = 0; i < ctLength; i++) {
    //   scalarData[i] = -1024
    // }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeUID: ctVolumeUID,
          callback: setCTWWWC,
          blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
        },
      ],
      viewportInput.map(({ viewportUID }) => viewportUID)
    )

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

    this.resetToolModes(ctSceneToolGroup)

    const tools = Object.entries(ctSceneToolGroup.toolOptions)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.length &&
        bindings.some(
          (binding) =>
            binding.mouseButton === csToolsEnums.MouseBindings.Primary
        )
    )

    ctSceneToolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings = ctSceneToolGroup.toolOptions[toolName].bindings

    ctSceneToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        { mouseButton: csToolsEnums.MouseBindings.Primary },
      ],
    })

    this.renderingEngine.render()
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

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Rendering with different presets({this.state.progressText})</h2>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
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

        <div>
          <select
            value={this.state.preset}
            onChange={(e) => this.setState({ preset: e.target.value })}
          >
            {presetNames.map((presetName) => (
              <option key={presetName} value={presetName}>
                {presetName}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const viewports = this.renderingEngine.getViewports()
              // first one is enough for this example

              viewports.forEach((viewport) => {
                const { volumeActor } = viewport.getDefaultActor()
                const preset = presets.find(
                  (preset) => preset.name === this.state.preset
                )
                applyPreset(volumeActor, preset)
              })
              this.renderingEngine.render()
            }}
          >
            Apply Preset
          </button>
        </div>

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

export default ApplyPresetExample
