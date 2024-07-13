import { log, data as dcmjsData, normalizers } from "dcmjs";
import checkOrientation from "../helpers/checkOrientation";
import compareArrays from "../helpers/compareArrays";

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { Normalizer } = normalizers;

async function generateToolState(
    imageIds,
    arrayBuffer,
    metadataProvider,
    tolerance = 1e-3
) {
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);
    const imagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        imageIds[0]
    );

    if (!imagePlaneModule) {
        console.warn("Insufficient metadata, imagePlaneModule missing.");
    }

    const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
        ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
        : [
              imagePlaneModule.rowCosines.x,
              imagePlaneModule.rowCosines.y,
              imagePlaneModule.rowCosines.z,
              imagePlaneModule.columnCosines.x,
              imagePlaneModule.columnCosines.y,
              imagePlaneModule.columnCosines.z
          ];

    // It currently supports parametric maps with same orientation
    const validOrientations = [ImageOrientationPatient];
    const pixelData = getPixelData(multiframe);
    const orientation = checkOrientation(
        multiframe,
        validOrientations,
        [imagePlaneModule.rows, imagePlaneModule.columns, imageIds.length],
        tolerance
    );

    // Pre-compute the sop UID to imageId index map so that in the for loop
    // we don't have to call metadataProvider.get() for each imageId over
    // and over again.
    const sopUIDImageIdIndexMap = imageIds.reduce((acc, imageId) => {
        const { sopInstanceUID } = metadataProvider.get(
            "generalImageModule",
            imageId
        );
        acc[sopInstanceUID] = imageId;
        return acc;
    }, {});

    if (orientation !== "Planar") {
        const orientationText = {
            Perpendicular: "orthogonal",
            Oblique: "oblique"
        };

        throw new Error(
            `Parametric maps ${orientationText[orientation]} to the acquisition plane of the source data are not yet supported.`
        );
    }

    // Pre-compute the indices and metadata so that we don't have to call
    // a function for each imageId in the for loop.
    const imageIdMaps = imageIds.reduce(
        (acc, curr, index) => {
            acc.indices[curr] = index;
            acc.metadata[curr] = metadataProvider.get("instance", curr);
            return acc;
        },
        { indices: {}, metadata: {} }
    );

    await insertPixelDataPlanar(
        pixelData,
        multiframe,
        imageIds,
        metadataProvider,
        tolerance,
        sopUIDImageIdIndexMap,
        imageIdMaps
    );

    return { pixelData };
}

function insertPixelDataPlanar(
    sourcePixelData,
    multiframe,
    imageIds,
    metadataProvider,
    tolerance,
    sopUIDImageIdIndexMap,
    imageIdMaps
) {
    const targetPixelData = new sourcePixelData.constructor(
        sourcePixelData.length
    );

    const { PerFrameFunctionalGroupsSequence, Rows, Columns } = multiframe;
    const sliceLength = Columns * Rows;
    const numSlices = PerFrameFunctionalGroupsSequence.length;

    for (let i = 0; i < numSlices; i++) {
        const sourceSliceDataView = new sourcePixelData.constructor(
            sourcePixelData.buffer,
            i * sliceLength,
            sliceLength
        );

        const imageId = findReferenceSourceImageId(
            multiframe,
            i,
            imageIds,
            metadataProvider,
            tolerance,
            sopUIDImageIdIndexMap
        );

        if (!imageId) {
            console.warn(
                "Image not present in stack, can't import frame : " + i + "."
            );
            continue;
        }

        const sourceImageMetadata = imageIdMaps.metadata[imageId];
        if (
            Rows !== sourceImageMetadata.Rows ||
            Columns !== sourceImageMetadata.Columns
        ) {
            throw new Error(
                "Parametric map have different geometry dimensions (Rows and Columns) " +
                    "respect to the source image reference frame. This is not yet supported."
            );
        }

        const imageIdIndex = imageIdMaps.indices[imageId];
        const byteOffset =
            sliceLength * imageIdIndex * targetPixelData.BYTES_PER_ELEMENT;
        const targetSliceDataView = new targetPixelData.constructor(
            targetPixelData.buffer,
            byteOffset,
            sliceLength
        );

        // Copy from source to target which works for parametric maps with same orientation.
        // TODO: Find a dataset with parametric map in a different orientation and add finish this implementation
        targetSliceDataView.set(sourceSliceDataView);
    }

    return targetPixelData;
}

function getPixelData(multiframe) {
    let TypedArrayClass;
    let data;

    if (multiframe.PixelData) {
        const validTypedArrays =
            multiframe.BitsAllocated === 16
                ? [Uint16Array, Int16Array]
                : [Uint32Array, Int32Array];

        TypedArrayClass = validTypedArrays[multiframe.PixelRepresentation ?? 0];
        data = multiframe.PixelData;
    } else if (multiframe.FloatPixelData) {
        TypedArrayClass = Float32Array;
        data = multiframe.FloatPixelData;
    } else if (multiframe.DoubleFloatPixelData) {
        TypedArrayClass = Float64Array;
        data = multiframe.DoubleFloatPixelData;
    }

    if (data === undefined) {
        log.error("This parametric map pixel data is undefined.");
    }

    if (Array.isArray(data)) {
        data = data[0];
    }

    return new TypedArrayClass(data);
}

function findReferenceSourceImageId(
    multiframe,
    frameSegment,
    imageIds,
    metadataProvider,
    tolerance,
    sopUIDImageIdIndexMap
) {
    let imageId = undefined;

    if (!multiframe) {
        return imageId;
    }

    const {
        FrameOfReferenceUID,
        PerFrameFunctionalGroupsSequence,
        SourceImageSequence,
        ReferencedSeriesSequence
    } = multiframe;

    if (
        !PerFrameFunctionalGroupsSequence ||
        PerFrameFunctionalGroupsSequence.length === 0
    ) {
        return imageId;
    }

    const PerFrameFunctionalGroup =
        PerFrameFunctionalGroupsSequence[frameSegment];

    if (!PerFrameFunctionalGroup) {
        return imageId;
    }

    let frameSourceImageSequence = undefined;
    if (PerFrameFunctionalGroup.DerivationImageSequence) {
        let DerivationImageSequence =
            PerFrameFunctionalGroup.DerivationImageSequence;
        if (Array.isArray(DerivationImageSequence)) {
            if (DerivationImageSequence.length !== 0) {
                DerivationImageSequence = DerivationImageSequence[0];
            } else {
                DerivationImageSequence = undefined;
            }
        }

        if (DerivationImageSequence) {
            frameSourceImageSequence =
                DerivationImageSequence.SourceImageSequence;
            if (Array.isArray(frameSourceImageSequence)) {
                if (frameSourceImageSequence.length !== 0) {
                    frameSourceImageSequence = frameSourceImageSequence[0];
                } else {
                    frameSourceImageSequence = undefined;
                }
            }
        }
    } else if (SourceImageSequence && SourceImageSequence.length !== 0) {
        console.warn(
            "DerivationImageSequence not present, using SourceImageSequence assuming SEG has the same geometry as the source image."
        );
        frameSourceImageSequence = SourceImageSequence[frameSegment];
    }

    if (frameSourceImageSequence) {
        imageId = getImageIdOfSourceImageBySourceImageSequence(
            frameSourceImageSequence,
            sopUIDImageIdIndexMap
        );
    }

    if (imageId === undefined && ReferencedSeriesSequence) {
        const referencedSeriesSequence = Array.isArray(ReferencedSeriesSequence)
            ? ReferencedSeriesSequence[0]
            : ReferencedSeriesSequence;
        const ReferencedSeriesInstanceUID =
            referencedSeriesSequence.SeriesInstanceUID;

        imageId = getImageIdOfSourceImagebyGeometry(
            ReferencedSeriesInstanceUID,
            FrameOfReferenceUID,
            PerFrameFunctionalGroup,
            imageIds,
            metadataProvider,
            tolerance
        );
    }

    return imageId;
}

function getImageIdOfSourceImageBySourceImageSequence(
    SourceImageSequence,
    sopUIDImageIdIndexMap
) {
    const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
        SourceImageSequence;

    return ReferencedFrameNumber
        ? getImageIdOfReferencedFrame(
              ReferencedSOPInstanceUID,
              ReferencedFrameNumber,
              sopUIDImageIdIndexMap
          )
        : sopUIDImageIdIndexMap[ReferencedSOPInstanceUID];
}

function getImageIdOfSourceImagebyGeometry(
    ReferencedSeriesInstanceUID,
    FrameOfReferenceUID,
    PerFrameFunctionalGroup,
    imageIds,
    metadataProvider,
    tolerance
) {
    if (
        ReferencedSeriesInstanceUID === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence[0] === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence[0]
            .ImagePositionPatient === undefined
    ) {
        return undefined;
    }

    for (
        let imageIdsIndex = 0;
        imageIdsIndex < imageIds.length;
        ++imageIdsIndex
    ) {
        const sourceImageMetadata = metadataProvider.get(
            "instance",
            imageIds[imageIdsIndex]
        );

        if (
            sourceImageMetadata === undefined ||
            sourceImageMetadata.ImagePositionPatient === undefined ||
            sourceImageMetadata.FrameOfReferenceUID !== FrameOfReferenceUID ||
            sourceImageMetadata.SeriesInstanceUID !==
                ReferencedSeriesInstanceUID
        ) {
            continue;
        }

        if (
            compareArrays(
                PerFrameFunctionalGroup.PlanePositionSequence[0]
                    .ImagePositionPatient,
                sourceImageMetadata.ImagePositionPatient,
                tolerance
            )
        ) {
            return imageIds[imageIdsIndex];
        }
    }
}

function getImageIdOfReferencedFrame(
    sopInstanceUid,
    frameNumber,
    sopUIDImageIdIndexMap
) {
    const imageId = sopUIDImageIdIndexMap[sopInstanceUid];

    if (!imageId) {
        return;
    }

    const imageIdFrameNumber = Number(imageId.split("frame=")[1]);

    return imageIdFrameNumber === frameNumber - 1 ? imageId : undefined;
}

const ParametricMapObj = {
    generateToolState
};

export { ParametricMapObj as default, ParametricMapObj as ParametricMap };
