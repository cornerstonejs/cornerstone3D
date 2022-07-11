import "regenerator-runtime/runtime.js";

import dcmjs from "../src/index.js";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import fsPromises from "fs/promises";
import { getZippedTestDataset, getTestDataset } from "./testUtils.js";

const {
    DicomMetaDictionary,
    DicomDict,
    DicomMessage,
    ReadBufferStream
} = dcmjs.data;

const areEqual = (first, second) =>
    first.byteLength === second.byteLength &&
    first.every((value, index) => value === second[index]);

it("test_untilTag", () => {
    const buffer = fs.readFileSync("test/sample-dicom.dcm");
    console.time("readFile");
    const fullData = DicomMessage.readFile(buffer.buffer);
    console.timeEnd("readFile");

    console.time("readFile without untilTag");
    const dicomData = DicomMessage.readFile(buffer.buffer, {
        untilTag: "7FE00010",
        includeUntilTagValue: false
    });
    console.timeEnd("readFile without untilTag");

    console.time("readFile with untilTag");
    const dicomData2 = DicomMessage.readFile(buffer.buffer, {
        untilTag: "7FE00010",
        includeUntilTagValue: true
    });
    console.timeEnd("readFile with untilTag");

    const full_dataset = DicomMetaDictionary.naturalizeDataset(fullData.dict);
    full_dataset._meta = DicomMetaDictionary.namifyDataset(fullData.meta);

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);

    const dataset2 = DicomMetaDictionary.naturalizeDataset(dicomData2.dict);
    dataset2._meta = DicomMetaDictionary.namifyDataset(dicomData2.meta);

    expect(full_dataset.PixelData).toEqual(dataset2.PixelData);
    expect(dataset.PixelData).toEqual(0);
});

it("noCopy multiframe DICOM which has trailing padding", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/binary-parsing-stressors/multiframe-ultrasound.dcm";
    const dcmPath = await getTestDataset(url, "multiframe-ultrasound.dcm")
    const dicomDictNoCopy = DicomMessage.readFile(
        fs.readFileSync(dcmPath).buffer,
        {
            noCopy: true
        }
    );

    const dicomDict = DicomMessage.readFile(fs.readFileSync(dcmPath).buffer, {
        noCopy: false
    });

    Object.keys(dicomDict.dict).map(key => {
        const value = dicomDict.dict[key].Value;
        if (value[0] instanceof ArrayBuffer) {
            value.map((e, idx) => {
                const noCopyValue = dicomDictNoCopy.dict[key].Value[idx];
                const copyValue = new Uint8Array(e);
                expect(areEqual(noCopyValue, copyValue)).toEqual(true);
            });
        }
    });
});

it("noCopy multiframe DICOM with large private tags before and after the image data", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/binary-parsing-stressors/large-private-tags.dcm";
    const dcmPath = await getTestDataset(url, "large-private-tags.dcm")

    const dicomDictNoCopy = DicomMessage.readFile(
        fs.readFileSync(dcmPath).buffer,
        {
            noCopy: true
        }
    );

    const dicomDict = DicomMessage.readFile(fs.readFileSync(dcmPath).buffer, {
        noCopy: false
    });

    Object.keys(dicomDict.dict).map(key => {
        const value = dicomDict.dict[key].Value;
        if (value[0] instanceof ArrayBuffer) {
            value.map((e, idx) => {
                const noCopyValue = dicomDictNoCopy.dict[key].Value[idx];
                const copyValue = new Uint8Array(e);
                expect(areEqual(noCopyValue, copyValue)).toEqual(true);
            });
        }
    });
});

it("noCopy binary data into an ArrayBuffer", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/binary-tag/binary-tag.dcm";
    const dcmPath = await getTestDataset(url, "binary-tag.dcm")
    const fileData = await promisify(fs.readFile)(dcmPath);

    const dicomDictNoCopy = DicomMessage.readFile(fileData.buffer, {
        noCopy: true
    });

    const dicomDict = DicomMessage.readFile(fileData.buffer, {
        noCopy: false
    });

    Object.keys(dicomDict.dict).map(key => {
        const value = dicomDict.dict[key].Value;
        if (value[0] instanceof ArrayBuffer) {
            value.map((e, idx) => {
                const noCopyValue = dicomDictNoCopy.dict[key].Value[idx];
                const copyValue = new Uint8Array(e);
                expect(areEqual(noCopyValue, copyValue)).toEqual(true);
            });
        }
    });
});

it("noCopy test_multiframe_1", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/MRHead/MRHead.zip";
        
    const unzipPath = await getZippedTestDataset(url, "MRHead.zip", "test_multiframe_1");
    const mrHeadPath = path.join(unzipPath, "MRHead");
    const fileNames = await fsPromises.readdir(mrHeadPath);

    const datasets = [];
    fileNames.forEach(fileName => {
        const arrayBuffer = fs.readFileSync(path.join(mrHeadPath, fileName))
            .buffer;
        const dicomDictNoCopy = DicomMessage.readFile(arrayBuffer, {
            noCopy: true
        });
        const dicomDict = DicomMessage.readFile(arrayBuffer, {
            noCopy: false
        });

        Object.keys(dicomDict.dict).map(key => {
            const value = dicomDict.dict[key].Value;
            if (value[0] instanceof ArrayBuffer) {
                value.map((e, idx) => {
                    const noCopyValue = dicomDictNoCopy.dict[key].Value[idx];
                    const copyValue = new Uint8Array(e);
                    expect(areEqual(noCopyValue, copyValue)).toEqual(true);
                });
            }
        });
    });
});

it("noCopy test_fragment_multiframe", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/encapsulation/encapsulation-fragment-multiframe.dcm";
    const dcmPath = await getTestDataset(url, "encapsulation-fragment-multiframe.dcm")
    const file = fs.readFileSync(dcmPath);

    const dicomDict = dcmjs.data.DicomMessage.readFile(file.buffer, {
        // ignoreErrors: true,
    });

    const dicomDictNoCopy = DicomMessage.readFile(file.buffer, {
        noCopy: true
    });

    Object.keys(dicomDict.dict).map(key => {
        const value = dicomDict.dict[key].Value;
        if (value[0] instanceof ArrayBuffer) {
            value.map((e, idx) => {
                const noCopyValue = dicomDictNoCopy.dict[key].Value[idx];
                const copyValue = new Uint8Array(e);
                const areEqual = (first, second) =>
                    first.every((value, index) => value === second[index]);

                const totalSize = noCopyValue.reduce(
                    (sum, arr) => sum + arr.byteLength,
                    0
                );
                expect(totalSize).toEqual(copyValue.length);
                expect(areEqual(noCopyValue[0], copyValue)).toEqual(true);
            });
        }
    });
});
