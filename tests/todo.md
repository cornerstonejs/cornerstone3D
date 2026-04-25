[] - rename viewport next -> generic viewport

[] why we have render mode in options

stackViewport.setDataList([
      {
        dataId: stackDataId,
        options: {
          renderMode: stackRenderMode,
        },
      },
    ]),
    volumeViewport.setDataList([
      {
        dataId: volumeDataId,
        options: {
          orientation: OrientationAxis.SAGITTAL,
          renderMode: volumeRenderMode,
        },
      },
    ]),
