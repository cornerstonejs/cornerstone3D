import React, { Component } from 'react'
// ~~
import * as cs from '@precisionmetrics/cornerstone-render'
import {
  RenderingEngine,
  ORIENTATION,
  VIEWPORT_TYPE,
  metaData,
  createAndCacheVolume,
  init as csRenderInit,
  setVolumesOnViewports,
} from '@precisionmetrics/cornerstone-render'
import { ToolBindings } from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import { registerWebImageLoader } from '@precisionmetrics/cornerstone-image-loader-streaming-volume'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'
import { initToolGroups } from './initToolGroups'

const axialViewportID = 'AXIAL'
const sagittalViewportID = 'SAGITTAL'
const coronalViewportID = 'CORONAL'

let colorSceneToolGroup
class ColorExample extends Component {
  state = {
    viewportSizes: [
      [512, 512],
      [512, 512],
      [512, 512],
    ],
  }

  constructor(props) {
    super(props)

    this.axialContainer = React.createRef()
    this.sagittalContainer = React.createRef()
    this.coronalContainer = React.createRef()
  }

  componentWillUnmount() {
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    registerWebImageLoader(cs)
    const renderingEngineUID = 'ExampleRenderingEngineID'
    const { imageIds } = config.colorImages

    ;({ colorSceneToolGroup } = initToolGroups())

    metaData.addProvider(
      (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
      10000
    )

    const volumeUID = 'VOLUME'

    const volume = await createAndCacheVolume(volumeUID, { imageIds })

    volume.load()

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    this.axialViewportID = axialViewportID
    this.sagittalViewportID = sagittalViewportID
    this.coronalViewportID = coronalViewportID

    renderingEngine.setViewports([
      {
        viewportUID: axialViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this.axialContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: sagittalViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this.sagittalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        viewportUID: coronalViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this.coronalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
    ])

    colorSceneToolGroup.addTool(WindowLevelTool.toolName, {
      configuration: { volumeUID },
    })
    colorSceneToolGroup.addTool(PanTool.toolName, {
      configuration: { volumeUID },
    })
    colorSceneToolGroup.addTool(ZoomTool.toolName, {
      configuration: { volumeUID },
    })
    colorSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName, {
      configuration: { volumeUID },
    })

    colorSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName)
    colorSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    })
    colorSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Auxiliary }],
    })
    colorSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: ToolBindings.Mouse.Secondary }],
    })

    await setVolumesOnViewports(
      this.renderingEngine,
      [
        {
          volumeUID: volumeUID,
          callback: ({ volumeActor, volumeUID }) => {
            volumeActor.getProperty().setIndependentComponents(false)
            volumeActor.getProperty().setInterpolationTypeToNearest()
          },
        },
      ],
      [axialViewportID, sagittalViewportID, coronalViewportID]
    )

    colorSceneToolGroup.addViewport(axialViewportID, renderingEngineUID)
    colorSceneToolGroup.addViewport(sagittalViewportID, renderingEngineUID)
    colorSceneToolGroup.addViewport(coronalViewportID, renderingEngineUID)

    renderingEngine.render()
  }

  render() {
    const { viewportSizes } = this.state

    const style0 = {
      width: `${viewportSizes[0][0]}px`,
      height: `${viewportSizes[0][1]}px`,
    }

    const style1 = {
      width: `${viewportSizes[1][0]}px`,
      height: `${viewportSizes[1][1]}px`,
    }

    const style2 = {
      width: `${viewportSizes[2][0]}px`,
      height: `${viewportSizes[2][1]}px`,
    }

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>Color Example</h1>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
        </div>
        <div className="row">
          <div>
            <div
              style={{
                ...style0,
                width: viewportSizes[0][0],
                height: viewportSizes[0][1],
              }}
              ref={this.axialContainer}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div
              style={{
                ...style0,
                width: viewportSizes[1][0],
                height: viewportSizes[1][1],
              }}
              ref={this.sagittalContainer}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div
              style={{
                ...style0,
                width: viewportSizes[2][0],
                height: viewportSizes[2][1],
              }}
              ref={this.coronalContainer}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>
      </div>
    )
  }
}

export default ColorExample
