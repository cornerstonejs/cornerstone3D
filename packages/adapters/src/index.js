import { BitArray } from "./bitArray.js";
import { ReadBufferStream } from "./BufferStream.js";
import { WriteBufferStream } from "./BufferStream.js";
import { DicomDict } from "./DicomDict.js";
import { DicomMessage } from "./DicomMessage.js";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DICOMWEB } from "./dicomweb.js";
import { Tag } from "./Tag.js";
import { ValueRepresentation } from "./ValueRepresentation.js";
//export { anonymizer } from './anonymizer.js';
import { Colors } from "./colors.js";
import { datasetToBlob } from "./datasetToBlob.js";

let data = {
    BitArray,
    ReadBufferStream,
    WriteBufferStream,
    DicomDict,
    DicomMessage,
    DicomMetaDictionary,
    Tag,
    ValueRepresentation,
    Colors,
    datasetToBlob
};

export { data };

import { DerivedDataset } from "./derivations.js";
import { DerivedPixels } from "./derivations.js";
import { DerivedImage } from "./derivations.js";
import { Segmentation } from "./derivations.js";
import { StructuredReport } from "./derivations.js";
import { ParametricMap } from "./derivations.js";

let derivations = {
    DerivedDataset,
    DerivedPixels,
    DerivedImage,
    Segmentation,
    StructuredReport,
    ParametricMap
};

export { derivations };

import { Normalizer } from "./normalizers.js";
import { ImageNormalizer } from "./normalizers.js";
import { MRImageNormalizer } from "./normalizers.js";
import { EnhancedMRImageNormalizer } from "./normalizers.js";
import { EnhancedUSVolumeNormalizer } from "./normalizers.js";
import { CTImageNormalizer } from "./normalizers.js";
import { PETImageNormalizer } from "./normalizers.js";
import { SEGImageNormalizer } from "./normalizers.js";
import { DSRNormalizer } from "./normalizers.js";

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

export { normalizers };

import adapters from "./adapters/index.js";
import utilities from "./utilities/index.js";

export { adapters };
export { utilities };
export { DICOMWEB };
