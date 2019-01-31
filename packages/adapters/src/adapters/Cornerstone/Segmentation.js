import { BitArray } from "../../bitArray.js";

export default class Segmentation {
  constructor() {}

  static generateToolState(imageIds, images, brushData) {
    // NOTE: here be dragons. Currently if a brush has been used and then erased,
    // This will flag up as a segmentation, even though its full of zeros.
    // Fixing this cleanly really requires an update of cornerstoneTools?

    const { toolState, segments } = brushData;
    const image0 = images[0];

    const dims = {
      x: image0.columns,
      y: image0.rows,
      z: imageIds.length
    };

    dims.xy = dims.x * dims.y;
    dims.xyz = dims.xy * dims.z;

    const multiframe = imageIds[0].includes("?frame");

    const seg = Segmentation.createSegFromImages(images, multiframe);
    const numSegments = Segmentation.addMetaDataToSegAndGetSegCount(
      seg,
      segments
    );

    const cToolsPixelData = new Uint8ClampedArray(dims.xyz * numSegments);

    if (!numSegments) {
      throw new Warning("No segments to export!");
    }

    let currentSeg = 0;

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      if (!segments[segIdx]) {
        continue;
      }

      for (let z = 0; z < imageIds.length; z++) {
        const imageIdSpecificToolState = toolState[imageIds[z]];

        if (
          imageIdSpecificToolState &&
          imageIdSpecificToolState.brush &&
          imageIdSpecificToolState.brush.data
        ) {
          const pixelData =
            imageIdSpecificToolState.brush.data[segIdx].pixelData;

          for (let p = 0; p < dims.xy; p++) {
            cToolsPixelData[currentSeg * dims.xyz + z * dims.xy + p] =
              pixelData[p];
          }
        }
      }

      currentSeg++;
    }

    const dataSet = seg.dataset;

    // Re-define the PixelData ArrayBuffer to be the correct length
    // => segments * rows * columns * slices / 8 (As 8 bits/byte)
    seg.dataset.PixelData = new ArrayBuffer((numSegments * dims.xyz) / 8);

    const pixelDataUint8View = new Uint8Array(seg.dataset.PixelData);
    const bitPackedcToolsData = BitArray.pack(cToolsPixelData);

    for (let i = 0; i < pixelDataUint8View.length; i++) {
      pixelDataUint8View[i] = bitPackedcToolsData[i];
    }

    const segBlob = dcmjs.data.datasetToBlob(seg.dataset);

    return segBlob;
  }

  static addMetaDataToSegAndGetSegCount(seg, segments) {
    let numSegments = 0;

    for (let i = 0; i < segments.length; i++) {
      if (segments[i]) {
        numSegments++;

        seg.addSegment(segments[i]);
      }
    }

    return numSegments;
  }

  /**
   * @static createSegFromImages - description
   *
   * @param  {object} images       description
   * @param  {Boolean} isMultiframe description
   * @returns {dataSet}              description
   */
  static createSegFromImages(images, isMultiframe) {
    const datasets = [];

    if (isMultiframe) {
      const image = images[0];
      const arrayBuffer = image.data.byteArray.buffer;

      const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
      );

      dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
        dicomData.meta
      );

      datasets.push(dataset);
    } else {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const arrayBuffer = image.data.byteArray.buffer;
        const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
          dicomData.dict
        );

        dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
          dicomData.meta
        );
        datasets.push(dataset);
      }
    }

    const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(
      datasets
    );

    return new dcmjs.derivations.Segmentation([multiframe]);
  }

  static readToolState(imageIds, arrayBuffer) {
    dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    let dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
      dicomData.dict
    );
    dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
      dicomData.meta
    );
    const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset([
      dataset
    ]);

    const dims = {
      x: multiframe.Columns,
      y: multiframe.Rows,
      z: imageIds.length,
      xy: multiframe.Columns * multiframe.Rows,
      xyz: multiframe.Columns * multiframe.Rows * imageIds.length
    };

    const segmentSequence = multiframe.SegmentSequence;
    const pixelData = dcmjs.data.BitArray.unpack(multiframe.PixelData);

    const segMetadata = {
      seriesInstanceUid: multiframe.SeriesInstanceUid,
      data: []
    };

    const toolState = {};

    if (Array.isArray(segmentSequence)) {
      const segCount = segmentSequence.length;

      for (let z = 0; z < imageIds.length; z++) {
        const imageId = imageIds[z];

        const imageIdSpecificToolState = {};

        imageIdSpecificToolState.brush = {};
        imageIdSpecificToolState.brush.data = [];

        const brushData = imageIdSpecificToolState.brush.data;

        for (let i = 0; i < segCount; i++) {
          brushData[i] = {
            invalidated: true,
            pixelData: new Uint8ClampedArray(dims.x * dims.y)
          };
        }

        toolState[imageId] = imageIdSpecificToolState;
      }

      for (let segIdx = 0; segIdx < segmentSequence.length; segIdx++) {
        segMetadata.data.push(segmentSequence[segIdx]);

        for (let z = 0; z < imageIds.length; z++) {
          const imageId = imageIds[z];

          const cToolsPixelData =
            toolState[imageId].brush.data[segIdx].pixelData;

          for (let p = 0; p < dims.xy; p++) {
            cToolsPixelData[p] = pixelData[segIdx * dims.xyz + z * dims.xy + p];
          }
        }
      }
    } else {
      // Only one segment, will be stored as an object.
      segMetadata.data.push(segmentSequence);

      const segIdx = 0;

      for (let z = 0; z < imageIds.length; z++) {
        const imageId = imageIds[z];

        const imageIdSpecificToolState = {};

        imageIdSpecificToolState.brush = {};
        imageIdSpecificToolState.brush.data = [];
        imageIdSpecificToolState.brush.data[segIdx] = {
          invalidated: true,
          pixelData: new Uint8ClampedArray(dims.x * dims.y)
        };

        const cToolsPixelData =
          imageIdSpecificToolState.brush.data[segIdx].pixelData;

        for (let p = 0; p < dims.xy; p++) {
          cToolsPixelData[p] = pixelData[z * dims.xy + p];
        }

        toolState[imageId] = imageIdSpecificToolState;
      }
    }

    return { toolState, segMetadata };
  }
}
