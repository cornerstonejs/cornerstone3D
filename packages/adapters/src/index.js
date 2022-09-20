// Data
import { BitArray } from "./bitArray.js";
import { ReadBufferStream } from "./BufferStream.js";
import { DeflatedReadBufferStream } from "./BufferStream.js";
import { WriteBufferStream } from "./BufferStream.js";
import { DicomDict } from "./DicomDict.js";
import { DicomMessage } from "./DicomMessage.js";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DICOMWEB } from "./dicomweb.js";
import { Tag } from "./Tag.js";
import { ValueRepresentation } from "./ValueRepresentation.js";
import { Colors } from "./colors.js";
import log from "./log.js";

import {
    datasetToDict,
    datasetToBuffer,
    datasetToBlob
} from "./datasetToBlob.js";
// Derivations
import {
    DerivedDataset,
    DerivedPixels,
    DerivedImage,
    Segmentation,
    StructuredReport,
    ParametricMap
} from "./derivations/index.js";
// Normalizers

import { Normalizer } from "./normalizers.js";
import { ImageNormalizer } from "./normalizers.js";
import { MRImageNormalizer } from "./normalizers.js";
import { EnhancedMRImageNormalizer } from "./normalizers.js";
import { EnhancedUSVolumeNormalizer } from "./normalizers.js";
import { CTImageNormalizer } from "./normalizers.js";
import { PETImageNormalizer } from "./normalizers.js";
import { SEGImageNormalizer } from "./normalizers.js";
import { DSRNormalizer } from "./normalizers.js";

import adapters from "./adapters/index.js";
import utilities from "./utilities/index.js";
import sr from "./sr/index.js";

import { cleanTags, getTagsNameToEmpty } from "./anonymizer.js";

let data = {
    BitArray,
    ReadBufferStream,
    DeflatedReadBufferStream,
    WriteBufferStream,
    DicomDict,
    DicomMessage,
    DicomMetaDictionary,
    Tag,
    ValueRepresentation,
    Colors,
    datasetToDict,
    datasetToBuffer,
    datasetToBlob
};

let derivations = {
    DerivedDataset,
    DerivedPixels,
    DerivedImage,
    Segmentation,
    StructuredReport,
    ParametricMap
};

let normalizers = {
    Normalizer,
    ImageNormalizer,
    MRImageNormalizer,
    EnhancedMRImageNormalizer,
    EnhancedUSVolumeNormalizer,
    CTImageNormalizer,
    PETImageNormalizer,
    SEGImageNormalizer,
    DSRNormalizer
};

let anonymizer = {
    cleanTags,
    getTagsNameToEmpty
};

const dcmjs = {
    DICOMWEB,
    adapters,
    data,
    derivations,
    normalizers,
    sr,
    utilities,
    log,
    anonymizer
};

export {
    DICOMWEB,
    adapters,
    data,
    derivations,
    normalizers,
    sr,
    utilities,
    log,
    anonymizer
};

export default dcmjs;
