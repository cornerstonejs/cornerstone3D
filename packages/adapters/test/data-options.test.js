import "regenerator-runtime/runtime.js";

import dcmjs from "../src/index.js";
import fs from "fs";
import path from "path";
import os from "os";
import followRedirects from "follow-redirects";
const { https } = followRedirects;
import { promisify } from "util";
import unzipper from "unzipper";
import fsPromises from "fs/promises";

const {
    DicomMetaDictionary,
    DicomDict,
    DicomMessage,
    ReadBufferStream
} = dcmjs.data;

function downloadToFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        https
            .get(url, response => {
                response.pipe(fileStream);
                fileStream.on("finish", () => {
                    resolve(filePath);
                });
            })
            .on("error", reject);
    });
}

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
    const dicomUrl =
        "https://github.com/dcmjs-org/data/releases/download/binary-parsing-stressors/multiframe-ultrasound.dcm";
    const dicomPath = path.join(os.tmpdir(), "multiframe-ultrasound.dcm");

    await downloadToFile(dicomUrl, dicomPath);

    const dicomDictNoCopy = DicomMessage.readFile(
        fs.readFileSync(dicomPath).buffer,
        {
            noCopy: true
        }
    );

    const dicomDict = DicomMessage.readFile(fs.readFileSync(dicomPath).buffer, {
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
    const dicomUrl =
        "https://github.com/dcmjs-org/data/releases/download/binary-parsing-stressors/large-private-tags.dcm";
    const dicomPath = path.join(os.tmpdir(), "large-private-tags.dcm");

    await downloadToFile(dicomUrl, dicomPath);

    const dicomDictNoCopy = DicomMessage.readFile(
        fs.readFileSync(dicomPath).buffer,
        {
            noCopy: true
        }
    );

    const dicomDict = DicomMessage.readFile(fs.readFileSync(dicomPath).buffer, {
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
    const dicomUrl =
        "https://github.com/dcmjs-org/data/releases/download/binary-tag/binary-tag.dcm";
    const dicomPath = path.join(os.tmpdir(), "binary-tag.dcm");

    await downloadToFile(dicomUrl, dicomPath);
    const fileData = await promisify(fs.readFile)(dicomPath);

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
    const zipFilePath = path.join(os.tmpdir(), "MRHead.zip");
    const unzipPath = path.join(os.tmpdir(), "test_multiframe_1");

    await downloadToFile(url, zipFilePath);

    await new Promise(resolve => {
        fs.createReadStream(zipFilePath).pipe(
            unzipper.Extract({ path: unzipPath }).on("close", resolve)
        );
    });

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
    const dcmPath = path.join(
        os.tmpdir(),
        "encapsulation-fragment-multiframe.dcm"
    );

    await downloadToFile(url, dcmPath);
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
