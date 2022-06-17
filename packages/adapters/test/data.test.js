import "regenerator-runtime/runtime.js";

import { jest } from "@jest/globals";
import dcmjs from "../src/index.js";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import unzipper from "unzipper";
import followRedirects from "follow-redirects";

const { https } = followRedirects;

import datasetWithNullNumberVRs from "./mocks/null_number_vrs_dataset.json";
import minimalDataset from "./mocks/minimal_fields_dataset.json";
import arrayItem from "./arrayItem.json";
import { rawTags } from "./rawTags";

const { DicomMetaDictionary, DicomDict, DicomMessage, ReadBufferStream } =
    dcmjs.data;

const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

// The asset downloads in this file might take some time on a slower connection
jest.setTimeout(60000);

const metadata = {
    "00020001": {
        Value: [fileMetaInformationVersionArray.buffer],
        vr: "OB"
    },
    "00020012": {
        Value: ["1.2.840.113819.7.1.1997.1.0"],
        vr: "UI"
    },
    "00020002": {
        Value: ["1.2.840.10008.5.1.4.1.1.4"],
        vr: "UI"
    },
    "00020003": {
        Value: [DicomMetaDictionary.uid()],
        vr: "UI"
    },
    "00020010": {
        Value: ["1.2.840.10008.1.2"],
        vr: "UI"
    }
};

const sequenceMetadata = {
    "00080081": { vr: "ST", Value: [null] },
    "00081032": {
        vr: "SQ",
        Value: [
            {
                "00080100": {
                    vr: "SH",
                    Value: ["IMG1332"]
                },
                "00080102": {
                    vr: "SH",
                    Value: ["L"]
                },
                "00080104": {
                    vr: "LO",
                    Value: ["MRI SHOULDER WITHOUT IV CONTRAST LEFT"]
                }
            }
        ]
    },

    52009229: {
        vr: "SQ",
        Value: [
            {
                "00289110": {
                    vr: "SQ",
                    Value: [
                        {
                            "00180088": {
                                vr: "DS",
                                Value: [0.12]
                            }
                        }
                    ]
                }
            }
        ]
    }
};

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

function makeOverlayBitmap({ width, height }) {
    const topBottom = new Array(width).fill(1, 0, width);
    const middle = new Array(width).fill(0, 0, width);
    const bitmap = [];

    middle[0] = 1;
    middle[width - 1] = 1;

    bitmap.push(topBottom);

    for (let i = 0; i < height - 2; i++) {
        bitmap.push(middle);
    }

    bitmap.push(topBottom);

    return bitmap.flat();
}

it("test_array_items", () => {
    const dicomJSON = JSON.stringify(arrayItem);
    const datasets = JSON.parse(dicomJSON);
    const natural0 = DicomMetaDictionary.naturalizeDataset(datasets[0]);
    // Shouldn't throw an exception
    const natural0b = DicomMetaDictionary.naturalizeDataset(datasets[0]);
    // And should be identical to the previous version
    expect(natural0b).toEqual(natural0);
});

it("test_json_1", () => {
    //
    // multiple results example
    // from http://dicom.nema.org/medical/dicom/current/output/html/part18.html#chapter_F
    //
    const dicomJSON = `
[
    {
        "0020000D": {
        "vr": "UI",
        "Value": [ "1.2.392.200036.9116.2.2.2.1762893313.1029997326.945873" ]
    }
    },
    {
    "0020000D" : {
        "vr": "UI",
        "Value": [ "1.2.392.200036.9116.2.2.2.2162893313.1029997326.945876" ]
    }
    }
]
`;
    const datasets = JSON.parse(dicomJSON);
    const firstUID = datasets[0]["0020000D"].Value[0];
    const secondUID = datasets[1]["0020000D"].Value[0];

    //
    // make a natural version of the first study and confirm it has correct value
    //
    const naturalDICOM = DicomMetaDictionary.naturalizeDataset(datasets[0]);

    expect(naturalDICOM.StudyInstanceUID).toEqual(firstUID);

    //
    // make a natural version of a dataset with sequence tags and confirm it has correct values
    //
    const naturalSequence =
        DicomMetaDictionary.naturalizeDataset(sequenceMetadata);

    // The match object needs to be done on the actual element, not the proxied value
    expect(naturalSequence.ProcedureCodeSequence[0]).toMatchObject({
        CodeValue: "IMG1332"
    });

    // tests that single element sequences have been converted
    // from arrays to values.
    // See discussion here for more details: https://github.com/dcmjs-org/dcmjs/commit/74571a4bd6c793af2a679a31cec7e197f93e28cc
    const spacing =
        naturalSequence.SharedFunctionalGroupsSequence.PixelMeasuresSequence
            .SpacingBetweenSlices;
    expect(spacing).toEqual(0.12);
    expect(
        Array.isArray(naturalSequence.SharedFunctionalGroupsSequence)
    ).toEqual(true);

    expect(naturalSequence.ProcedureCodeSequence[0]).toMatchObject({
        CodingSchemeDesignator: "L",
        CodeMeaning: "MRI SHOULDER WITHOUT IV CONTRAST LEFT"
    });

    // expect original data to remain unnaturalized
    expect(sequenceMetadata["00081032"].Value[0]).toHaveProperty("00080100");
    expect(sequenceMetadata["00081032"].Value[0]).toHaveProperty("00080102");
    expect(sequenceMetadata["00081032"].Value[0]).toHaveProperty("00080104");

    //
    // convert to part10 and back
    //
    const dicomDict = new DicomDict(metadata);
    dicomDict.dict = datasets[1];
    const part10Buffer = dicomDict.write();

    const dicomData = dcmjs.data.DicomMessage.readFile(part10Buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
    );

    expect(dataset.StudyInstanceUID).toEqual(secondUID);
});

it("test_multiframe_1", async () => {
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
        const arrayBuffer = fs.readFileSync(
            path.join(mrHeadPath, fileName)
        ).buffer;
        const dicomDict = DicomMessage.readFile(arrayBuffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

        datasets.push(dataset);
    });

    const multiframe =
        dcmjs.normalizers.Normalizer.normalizeToDataset(datasets);
    const spacing =
        multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence
            .SpacingBetweenSlices;
    const roundedSpacing = Math.round(100 * spacing) / 100;

    expect(multiframe.NumberOfFrames).toEqual(130);
    expect(roundedSpacing).toEqual(1.3);
});

it("test_oneslice_seg", async () => {
    const ctPelvisURL =
        "https://github.com/dcmjs-org/data/releases/download/CTPelvis/CTPelvis.zip";
    const segURL =
        "https://github.com/dcmjs-org/data/releases/download/CTPelvis/Lesion1_onesliceSEG.dcm";
    const zipFilePath = path.join(os.tmpdir(), "CTPelvis.zip");
    const unzipPath = path.join(os.tmpdir(), "test_oneslice_seg");
    const segFilePath = path.join(os.tmpdir(), "Lesion1_onesliceSEG.dcm");

    await downloadToFile(ctPelvisURL, zipFilePath);

    await new Promise(resolve => {
        fs.createReadStream(zipFilePath).pipe(
            unzipper.Extract({ path: unzipPath }).on("close", resolve)
        );
    });

    const ctPelvisPath = path.join(
        unzipPath,
        "Series-1.2.840.113704.1.111.1916.1223562191.15"
    );

    const fileNames = await fsPromises.readdir(ctPelvisPath);

    const datasets = [];
    fileNames.forEach(fileName => {
        const arrayBuffer = fs.readFileSync(
            path.join(ctPelvisPath, fileName)
        ).buffer;
        const dicomDict = DicomMessage.readFile(arrayBuffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
        datasets.push(dataset);
    });

    let multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(datasets);
    const spacing =
        multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence
            .SpacingBetweenSlices;
    const roundedSpacing = Math.round(100 * spacing) / 100;

    expect(multiframe.NumberOfFrames).toEqual(60);
    expect(roundedSpacing).toEqual(5);

    await downloadToFile(segURL, segFilePath);
    const arrayBuffer = fs.readFileSync(segFilePath).buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

    multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset([dataset]);
    expect(dataset.NumberOfFrames).toEqual(1);
    expect(multiframe.NumberOfFrames).toEqual(1);
});

it("test_normalizer_smaller", () => {
    const naturalizedTags =
        dcmjs.data.DicomMetaDictionary.naturalizeDataset(rawTags);

    const rawTagsLen = JSON.stringify(rawTags).length;
    const naturalizedTagsLen = JSON.stringify(naturalizedTags).length;
    expect(naturalizedTagsLen).toBeLessThan(rawTagsLen);
});

it("test_multiframe_us", () => {
    const file = fs.readFileSync("test/cine-test.dcm");
    const dicomData = dcmjs.data.DicomMessage.readFile(file.buffer, {
        // ignoreErrors: true,
    });
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
    );
    // eslint-disable-next-line no-underscore-dangle
    dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
        dicomData.meta
    );
    expect(dataset.NumberOfFrames).toEqual(8);
});

it("test_fragment_multiframe", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/encapsulation/encapsulation-fragment-multiframe.dcm";
    const dcmPath = path.join(
        os.tmpdir(),
        "encapsulation-fragment-multiframe.dcm"
    );

    await downloadToFile(url, dcmPath);
    const file = fs.readFileSync(dcmPath);
    const dicomData = dcmjs.data.DicomMessage.readFile(file.buffer, {
        // ignoreErrors: true,
    });
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
    );
    // eslint-disable-next-line no-underscore-dangle
    dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(
        dicomData.meta
    );
    expect(dataset.NumberOfFrames).toEqual(2);
});

it("test_null_number_vrs", () => {
    const dicomDict = new DicomDict({
        TransferSynxtaxUID: "1.2.840.10008.1.2.1"
    });
    dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(
        datasetWithNullNumberVRs
    );
    const part10Buffer = dicomDict.write();
    const dicomData = dcmjs.data.DicomMessage.readFile(part10Buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomData.dict
    );

    expect(dataset.ImageAndFluoroscopyAreaDoseProduct).toEqual(null);
    expect(dataset.InstanceNumber).toEqual(null);
});

it("test_exponential_notation", () => {
    const file = fs.readFileSync("test/sample-dicom.dcm");
    const data = dcmjs.data.DicomMessage.readFile(file.buffer, {
        // ignoreErrors: true,
    });
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(data.dict);
    dataset.ImagePositionPatient[2] = 7.1945578383e-5;
    const buffer = data.write();
    const copy = dcmjs.data.DicomMessage.readFile(buffer);
    expect(JSON.stringify(data)).toEqual(JSON.stringify(copy));
});

it("test_output_equality", () => {
    const file = fs.readFileSync("test/cine-test.dcm");
    const dicomData1 = dcmjs.data.DicomMessage.readFile(file.buffer, {
        // ignoreErrors: true,
    });

    const buffer = dicomData1.write();
    const dicomData2 = dcmjs.data.DicomMessage.readFile(buffer, {
        // ignoreErrors: true,
    });

    check_equality(dicomData1.meta, dicomData2.meta);
    check_equality(dicomData1.dict, dicomData2.dict);

    function check_equality(dict1, dict2) {
        Object.keys(dict1).forEach(key => {
            const elem1 = dict1[key];
            const elem2 = dict2[key];

            expect(JSON.stringify(elem1)).toEqual(JSON.stringify(elem2));
        });
    }
});

it("test_performance", async () => {
    const file = fs.readFileSync("test/cine-test.dcm");
    let buffer = file.buffer;
    let json;
    const start = Date.now();

    for (let i = 0; i < 100; ++i) {
        let old = json;
        json = DicomMessage.readFile(buffer);
        buffer = json.write();

        if (i > 0) {
            check_equality(old.meta, json.meta);
            check_equality(old.dict, json.dict);
        }
    }

    function check_equality(dict1, dict2) {
        Object.keys(dict1).forEach(key => {
            const elem1 = dict1[key];
            const elem2 = dict2[key];

            expect(JSON.stringify(elem1)).toEqual(JSON.stringify(elem2));
        });
    }

    console.log(`Finished. Total Time elapsed: ${Date.now() - start} ms`);
});

it("test_invalid_vr_length", () => {
    const file = fs.readFileSync("test/invalid-vr-length-test.dcm");
    const dicomDict = dcmjs.data.DicomMessage.readFile(file.buffer);

    expect(() =>
        writeToBuffer(dicomDict, { allowInvalidVRLength: false })
    ).toThrow();
    expect(() =>
        writeToBuffer(dicomDict, { allowInvalidVRLength: true })
    ).not.toThrow();

    function writeToBuffer(dicomDict, options) {
        return dicomDict.write(options);
    }
});

it("test_untiltag", () => {
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

it("test_encapsulation", async () => {
    const url =
        "https://github.com/dcmjs-org/data/releases/download/encapsulation/encapsulation.dcm";
    const dcmPath = path.join(os.tmpdir(), "encapsulation.dcm");

    await downloadToFile(url, dcmPath);

    // given
    const arrayBuffer = fs.readFileSync(dcmPath).buffer;
    const dicomDict = DicomMessage.readFile(arrayBuffer);

    dicomDict.upsertTag("60000010", "US", 30); // Overlay Rows
    dicomDict.upsertTag("60000011", "US", 30); // Overlay Columns
    dicomDict.upsertTag("60000040", "CS", "G"); // Overlay Type
    dicomDict.upsertTag("60000045", "LO", "AUTOMATED"); // Overlay Subtype
    dicomDict.upsertTag("60000050", "SS", [1 + 50, 1 + 50]); // Overlay Origin

    let overlay = dcmjs.data.BitArray.pack(
        makeOverlayBitmap({ width: 30, height: 30 })
    );

    if (overlay.length % 2 !== 0) {
        const newOverlay = new Uint8Array(overlay.length + 1);

        newOverlay.set(overlay);
        newOverlay.set([0], overlay.length);

        overlay = newOverlay;
    }

    dicomDict.upsertTag("60003000", "OB", [overlay.buffer]);

    // when
    const lengths = [];
    const stream = new ReadBufferStream(
            dicomDict.write({ fragmentMultiframe: false })
        ),
        useSyntax = EXPLICIT_LITTLE_ENDIAN;

    stream.reset();
    stream.increment(128);

    if (stream.readString(4) !== "DICM") {
        throw new Error("Invalid a dicom file");
    }

    const el = DicomMessage.readTag(stream, useSyntax),
        metaLength = el.values[0]; //read header buffer
    const metaStream = stream.more(metaLength);
    const metaHeader = DicomMessage.read(metaStream, useSyntax, false); //get the syntax
    let mainSyntax = metaHeader["00020010"].Value[0];

    mainSyntax = DicomMessage._normalizeSyntax(mainSyntax);

    while (!stream.end()) {
        const group = new Uint16Array(stream.buffer, stream.offset, 1)[0]
            .toString(16)
            .padStart(4, "0");
        const element = new Uint16Array(stream.buffer, stream.offset + 2, 1)[0]
            .toString(16)
            .padStart(4, "0");

        if (group.concat(element) === "60003000") {
            // Overlay Data
            const length = Buffer.from(
                new Uint8Array(stream.buffer, stream.offset + 8, 4)
            ).readUInt32LE(0);

            lengths.push(length);
        }

        if (group.concat(element) === "7fe00010") {
            // Pixel Data
            const length = Buffer.from(
                new Uint8Array(stream.buffer, stream.offset + 8, 4)
            ).readUInt32LE(0);

            lengths.push(length);
        }

        DicomMessage.readTag(stream, mainSyntax, null, false);
    }

    // then
    expect(lengths[0]).not.toEqual(0xffffffff);
    expect(lengths[1]).toEqual(0xffffffff);
});

it("test_custom_dictionary", () => {
    const customDictionary = DicomMetaDictionary.dictionary;

    customDictionary["(0013,1010)"] = {
        tag: "(0013,1010)",
        vr: "LO",
        name: "TrialName",
        vm: "1",
        version: "Custom"
    };

    const dicomMetaDictionary = new DicomMetaDictionary(customDictionary);
    const dicomDict = new DicomDict(metadata);
    minimalDataset["TrialName"] = "Test Trial";
    dicomDict.dict = dicomMetaDictionary.denaturalizeDataset(minimalDataset);
    const part10Buffer = dicomDict.write();
    const dicomData = DicomMessage.readFile(part10Buffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);

    expect(dataset.TrialName).toEqual("Test Trial");
    //check that all other fields were preserved, 15 original + 1 for _vr and +1 for "TrialName"
    expect(Object.keys(dataset).length).toEqual(17);
});
