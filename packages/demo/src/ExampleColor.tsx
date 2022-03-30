import React, { Component } from 'react';
// ~~
import * as cs from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  metaData,
  volumeLoader,
  init as csRenderInit,
  setVolumesForViewports,
  CONSTANTS,
} from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import * as csTools3d from '@cornerstonejs/tools';

import { registerWebImageLoader } from './helpers/registerWebImageLoader';
import config from './config/default';
import { hardcodedMetaDataProvider } from './helpers/initCornerstone';
import { initToolGroups } from './initToolGroups';

const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const axialViewportID = 'AXIAL';
const sagittalViewportID = 'SAGITTAL';
const coronalViewportID = 'CORONAL';

let colorSceneToolGroup;
class ColorExample extends Component {
  state = {
    viewportSizes: [
      [512, 512],
      [512, 512],
      [512, 512],
    ],
  };

  constructor(props) {
    super(props);

    this.axialContainer = React.createRef();
    this.sagittalContainer = React.createRef();
    this.coronalContainer = React.createRef();
  }

  componentWillUnmount() {
    csTools3d.destroy();
    this.renderingEngine.destroy();
  }

  async componentDidMount() {
    await csRenderInit();
    csTools3d.init();
    registerWebImageLoader(cs);
    const renderingEngineId = 'ExampleRenderingEngineID';
    const { imageIds } = config.colorImages;

    ({ colorSceneToolGroup } = initToolGroups());

    metaData.addProvider(
      (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
      10000
    );

    const volumeId = 'VOLUME';

    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    volume.load();

    const renderingEngine = new RenderingEngine(renderingEngineId);

    this.renderingEngine = renderingEngine;

    this.axialViewportID = axialViewportID;
    this.sagittalViewportID = sagittalViewportID;
    this.coronalViewportID = coronalViewportID;

    renderingEngine.setViewports([
      {
        viewportId: axialViewportID,
        type: ViewportType.ORTHOGRAPHIC,
        element: this.axialContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: sagittalViewportID,
        type: ViewportType.ORTHOGRAPHIC,
        element: this.sagittalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        viewportId: coronalViewportID,
        type: ViewportType.ORTHOGRAPHIC,
        element: this.coronalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
    ]);

    colorSceneToolGroup.addTool(WindowLevelTool.toolName, {
      configuration: { volumeId },
    });
    colorSceneToolGroup.addTool(PanTool.toolName, {
      configuration: { volumeId },
    });
    colorSceneToolGroup.addTool(ZoomTool.toolName, {
      configuration: { volumeId },
    });
    colorSceneToolGroup.addTool(StackScrollMouseWheelTool.toolName, {
      configuration: { volumeId },
    });

    colorSceneToolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    colorSceneToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
    colorSceneToolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
    });
    colorSceneToolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
    });

    await setVolumesForViewports(
      this.renderingEngine,
      [
        {
          volumeId: volumeId,
          callback: ({ volumeActor, volumeId }) => {
            volumeActor.getProperty().setIndependentComponents(false);
            volumeActor.getProperty().setInterpolationTypeToNearest();
          },
        },
      ],
      [axialViewportID, sagittalViewportID, coronalViewportID]
    );

    colorSceneToolGroup.addViewport(axialViewportID, renderingEngineId);
    colorSceneToolGroup.addViewport(sagittalViewportID, renderingEngineId);
    colorSceneToolGroup.addViewport(coronalViewportID, renderingEngineId);

    renderingEngine.render();
  }

  render() {
    const { viewportSizes } = this.state;

    const style0 = {
      width: `${viewportSizes[0][0]}px`,
      height: `${viewportSizes[0][1]}px`,
    };

    const style1 = {
      width: `${viewportSizes[1][0]}px`,
      height: `${viewportSizes[1][1]}px`,
    };

    const style2 = {
      width: `${viewportSizes[2][0]}px`,
      height: `${viewportSizes[2][1]}px`,
    };

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
    );
  }
}

export default ColorExample;
