const expect = require("chai").expect;
const dcmjs = require("../build/dcmjs");

const fs = require("fs");
const { https } = require("follow-redirects");
const os = require("os");
const path = require("path");
const unzipper = require("unzipper");
const datasetWithNullNumberVRs = require("./mocks/null_number_vrs_dataset.json");
const minimalDataset = require("./mocks/minimal_fields_dataset.json");

const { DicomMetaDictionary, DicomDict, DicomMessage, ReadBufferStream } = dcmjs.data;

const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

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
    "00080081": { "vr": "ST", "Value": [null] },
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

    "52009229": {
        vr: "SQ",
        Value: [
            {
                "00289110": {
                    vr: "SQ",
                    Value: [
                        {
                            "00180088": {
                                vr: "DS",
                                Value: [0.12],
                            }
                        }
                    ],
                },
            },
        ],
    },
};

function downloadToFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        const request = https
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

const tests = {
    test_json_1: () => {
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

        expect(naturalDICOM.StudyInstanceUID).to.equal(firstUID);

        //
        // make a natural version of a dataset with sequence tags and confirm it has correct values
        //
        const naturalSequence = DicomMetaDictionary.naturalizeDataset(
            sequenceMetadata
        );

        expect(naturalSequence.ProcedureCodeSequence).to.have.property(
            "CodeValue",
            "IMG1332"
        );

        // tests that single element sequences have been converted
        // from arrays to values.
        // See discussion here for more details: https://github.com/dcmjs-org/dcmjs/commit/74571a4bd6c793af2a679a31cec7e197f93e28cc
        const spacing = naturalSequence.SharedFunctionalGroupsSequence
            .PixelMeasuresSequence.SpacingBetweenSlices;
        expect(spacing).to.equal(0.12);
        expect(Array.isArray(naturalSequence.SharedFunctionalGroupsSequence)).to.equal(true);
    
        expect(naturalSequence.ProcedureCodeSequence).to.have.property(
            "CodingSchemeDesignator",
            "L"
        );
        expect(naturalSequence.ProcedureCodeSequence).to.have.property(
            "CodeMeaning",
            "MRI SHOULDER WITHOUT IV CONTRAST LEFT"
        );
        // expect original data to remain unnaturalized
        expect(sequenceMetadata["00081032"].Value[0]).to.have.keys(
            "00080100",
            "00080102",
            "00080104"
        );

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

        expect(dataset.StudyInstanceUID).to.equal(secondUID);
        console.log("Finished test_json_1");
    },

    test_multiframe_1: () => {
        const url =
            "https://github.com/dcmjs-org/data/releases/download/MRHead/MRHead.zip";
        const zipFilePath = path.join(os.tmpdir(), "MRHead.zip");
        const unzipPath = path.join(os.tmpdir(), "test_multiframe_1");

        downloadToFile(url, zipFilePath).then(() => {
            fs.createReadStream(zipFilePath).pipe(
                unzipper.Extract({ path: unzipPath }).on("close", () => {
                    const mrHeadPath = path.join(unzipPath, "MRHead");
                    fs.readdir(mrHeadPath, (err, fileNames) => {
                        expect(err).to.equal(null);
                        const datasets = [];
                        fileNames.forEach(fileName => {
                            const arrayBuffer = fs.readFileSync(
                                path.join(mrHeadPath, fileName)
                            ).buffer;
                            const dicomDict = DicomMessage.readFile(
                                arrayBuffer
                            );
                            const dataset = DicomMetaDictionary.naturalizeDataset(
                                dicomDict.dict
                            );
                            datasets.push(dataset);
                        });

                        const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(
                            datasets
                        );
                        const spacing =
                            multiframe.SharedFunctionalGroupsSequence
                                .PixelMeasuresSequence.SpacingBetweenSlices;
                        const roundedSpacing = Math.round(100 * spacing) / 100;

                        expect(multiframe.NumberOfFrames).to.equal(130);
                        expect(roundedSpacing).to.equal(1.3);
                        console.log("Finished test_multiframe_1");
                    });
                })
            );
        });
    },
    test_oneslice_seg: () => {
        const ctPelvisURL =
            "https://github.com/dcmjs-org/data/releases/download/CTPelvis/CTPelvis.zip";
        const segURL =
            "https://github.com/dcmjs-org/data/releases/download/CTPelvis/Lesion1_onesliceSEG.dcm";
        const zipFilePath = path.join(os.tmpdir(), "CTPelvis.zip");
        const unzipPath = path.join(os.tmpdir(), "test_oneslice_seg");
        const segFilePath = path.join(os.tmpdir(), "Lesion1_onesliceSEG.dcm");

        downloadToFile(ctPelvisURL, zipFilePath).then(() => {
            fs.createReadStream(zipFilePath).pipe(
                unzipper.Extract({ path: unzipPath }).on("close", () => {
                    const ctPelvisPath = path.join(
                        unzipPath,
                        "Series-1.2.840.113704.1.111.1916.1223562191.15"
                    );
                    fs.readdir(ctPelvisPath, (err, fileNames) => {
                        expect(err).to.equal(null);
                        const datasets = [];
                        fileNames.forEach(fileName => {
                            const arrayBuffer = fs.readFileSync(
                                path.join(ctPelvisPath, fileName)
                            ).buffer;
                            const dicomDict = DicomMessage.readFile(
                                arrayBuffer
                            );
                            const dataset = DicomMetaDictionary.naturalizeDataset(
                                dicomDict.dict
                            );
                            datasets.push(dataset);
                        });

                        const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(
                            datasets
                        );
                        const spacing =
                            multiframe.SharedFunctionalGroupsSequence
                                .PixelMeasuresSequence.SpacingBetweenSlices;
                        const roundedSpacing = Math.round(100 * spacing) / 100;

                        expect(multiframe.NumberOfFrames).to.equal(60);
                        expect(roundedSpacing).to.equal(5);

                        downloadToFile(segURL, segFilePath).then(() => {
                            const arrayBuffer = fs.readFileSync(segFilePath)
                                .buffer;
                            const dicomDict = DicomMessage.readFile(
                                arrayBuffer
                            );
                            const dataset = DicomMetaDictionary.naturalizeDataset(
                                dicomDict.dict
                            );
                            const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(
                                [dataset]
                            );
                            expect(dataset.NumberOfFrames).to.equal(1);
                            expect(multiframe.NumberOfFrames).to.equal(1);
                            console.log("Finished test_oneslice_seg");
                        });
                    });
                })
            );
        });
    },

    test_multiframe_us: () => {
        const file = fs.readFileSync(path.join(__dirname, "cine-test.dcm"));
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
        expect(dataset.NumberOfFrames).to.equal(8);
        console.log("Finished test_multiframe_us");
    },

    test_fragment_multiframe: () => {
        const url =
            "https://github.com/dcmjs-org/data/releases/download/encapsulation/encapsulation-fragment-multiframe.dcm";
        const dcmPath = path.join(os.tmpdir(), "encapsulation-fragment-multiframe.dcm");

        downloadToFile(url, dcmPath).then(() => {
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
            expect(dataset.NumberOfFrames).to.equal(2);
            console.log("Finished test_fragment_multiframe");
        });
    },

    test_null_number_vrs: () => {
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

        expect(dataset.ImageAndFluoroscopyAreaDoseProduct).to.equal(0);
        expect(dataset.InstanceNumber).to.equal(0);
        console.log("Finished test_null_number_vrs");
    },

    test_exponential_notation: () => {
        const file = fs.readFileSync(path.join(__dirname, 'sample-dicom.dcm'));
        const data = dcmjs.data.DicomMessage.readFile(file.buffer, {
            // ignoreErrors: true,
        });
        const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(data.dict);
        dataset.ImagePositionPatient[2] = 7.1945578383e-05;
        const buffer = data.write();
        const copy = dcmjs.data.DicomMessage.readFile(buffer);
        expect(JSON.stringify(data)).to.equal(JSON.stringify(copy));
    },

    test_output_equality: () => {
        const file = fs.readFileSync(path.join(__dirname, "cine-test.dcm"));
        const dicomData1 = dcmjs.data.DicomMessage.readFile(file.buffer, {
            // ignoreErrors: true,
        });

        const buffer = dicomData1.write();
        const dicomData2 = dcmjs.data.DicomMessage.readFile(buffer, {
            // ignoreErrors: true,
        });

        check_equality(dicomData1.meta, dicomData2.meta);
        check_equality(dicomData1.dict, dicomData2.dict);

        console.log("Finished test_output_equality");

        function check_equality(dict1, dict2) {
            Object.keys(dict1).forEach(key => {
                const elem1 = dict1[key];
                const elem2 = dict2[key];

                expect(JSON.stringify(elem1)).to.equal(JSON.stringify(elem2));
            });
        }
    },

    test_performance: async () => {
        const file = fs.readFileSync(path.join(__dirname, "cine-test.dcm"));
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

                expect(JSON.stringify(elem1)).to.equal(JSON.stringify(elem2));
            });
        }

        console.log(`Finished. Total Time elapsed: ${Date.now() - start} ms`);
    },

    test_invalid_vr_length: () => {
        const file = fs.readFileSync(
            path.join(__dirname, "invalid-vr-length-test.dcm")
        );
        const dicomDict = dcmjs.data.DicomMessage.readFile(file.buffer);

        expect(() =>
            writeToBuffer(dicomDict, { allowInvalidVRLength: false })
        ).to.throw();
        expect(() =>
            writeToBuffer(dicomDict, { allowInvalidVRLength: true })
        ).not.to.throw();

        function writeToBuffer(dicomDict, options) {
            return dicomDict.write(options);
        }
    },
    test_untiltag: () => {
        const buffer = fs.readFileSync(
            path.join(__dirname, 'sample-dicom.dcm')
        );
        console.time('readFile');
        const fullData = DicomMessage.readFile(buffer.buffer)
        console.timeEnd('readFile');

        console.time('readFile without untilTag');
        const dicomData = DicomMessage.readFile(buffer.buffer, options = { untilTag: '7FE00010', includeUntilTagValue: false });
        console.timeEnd('readFile without untilTag');

        console.time('readFile with untilTag');
        const dicomData2 = DicomMessage.readFile(buffer.buffer, options = { untilTag: '7FE00010', includeUntilTagValue: true });
        console.timeEnd('readFile with untilTag');

        const full_dataset = DicomMetaDictionary.naturalizeDataset(fullData.dict);
        full_dataset._meta = DicomMetaDictionary.namifyDataset(fullData.meta);

        const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
        dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);

        const dataset2 = DicomMetaDictionary.naturalizeDataset(dicomData2.dict);
        dataset2._meta = DicomMetaDictionary.namifyDataset(dicomData2.meta);

        expect(full_dataset.PixelData).to.deep.equal(dataset2.PixelData);
        expect(dataset.PixelData).to.deep.equal(0);
    },
    test_encapsulation: () => {
        const url =
            "https://github.com/dcmjs-org/data/releases/download/encapsulation/encapsulation.dcm";
        const dcmPath = path.join(os.tmpdir(), "encapsulation.dcm");

        downloadToFile(url, dcmPath).then(() => {
            // given
            const arrayBuffer = fs.readFileSync(dcmPath).buffer;
            const dicomDict = DicomMessage.readFile(arrayBuffer);

            dicomDict.upsertTag('60000010', 'US', 30); // Overlay Rows
            dicomDict.upsertTag('60000011', 'US', 30); // Overlay Columns
            dicomDict.upsertTag('60000040', 'CS', 'G'); // Overlay Type
            dicomDict.upsertTag('60000045', 'LO', 'AUTOMATED'); // Overlay Subtype
            dicomDict.upsertTag('60000050', 'SS', [1 + 50, 1 + 50]); // Overlay Origin

            let overlay = dcmjs.data.BitArray.pack(makeOverlayBitmap({ width: 30, height: 30 }));

            if (overlay.length % 2 !== 0) {
                const newOverlay = new Uint8Array(overlay.length + 1);

                newOverlay.set(overlay);
                newOverlay.set([0], overlay.length);

                overlay = newOverlay;
            }

            dicomDict.upsertTag('60003000', 'OB', [overlay.buffer]);

            // when
            const lengths = [];
            const stream = new ReadBufferStream(dicomDict.write({ fragmentMultiframe: false })), useSyntax = EXPLICIT_LITTLE_ENDIAN;

            stream.reset();
            stream.increment(128);

            if (stream.readString(4) !== "DICM") {
                throw new Error("Invalid a dicom file");
            }

            const el = DicomMessage.readTag(stream, useSyntax), metaLength = el.values[0]; //read header buffer
            const metaStream = stream.more(metaLength);
            const metaHeader = DicomMessage.read(metaStream, useSyntax, false); //get the syntax
            let mainSyntax = metaHeader["00020010"].Value[0];

            mainSyntax = DicomMessage._normalizeSyntax(mainSyntax);

            while (!stream.end()) {
                const group = new Uint16Array(stream.buffer, stream.offset, 1)[0].toString(16).padStart(4, '0');
                const element = new Uint16Array(stream.buffer, stream.offset + 2, 1)[0].toString(16).padStart(4, '0');

                if (group.concat(element) === '60003000') { // Overlay Data
                    const length = Buffer.from(new Uint8Array(stream.buffer, stream.offset + 8, 4)).readUInt32LE(0);

                    lengths.push(length);
                }

                if (group.concat(element) === '7fe00010') { // Pixel Data
                    const length = Buffer.from(new Uint8Array(stream.buffer, stream.offset + 8, 4)).readUInt32LE(0);

                    lengths.push(length);
                }

                DicomMessage.readTag(stream, mainSyntax, null, false);
            }

            // then
            expect(lengths[0]).not.to.equal(0xffffffff);
            expect(lengths[1]).to.equal(0xffffffff);

            console.log("Finished test_encapsulation");
        });
    },
    test_custom_dictionary: () => {
        const customDictionary = DicomMetaDictionary.dictionary;

        customDictionary["(0013,1010)"] = {
            tag: "(0013,1010)",
            vr: "LO",
            name: "TrialName",
            vm: "1",
            version: "Custom"
        }

        const dicomMetaDictionary = new DicomMetaDictionary(customDictionary);
        const dicomDict = new DicomDict(metadata);
        minimalDataset["TrialName"] = "Test Trial";
        dicomDict.dict = dicomMetaDictionary.denaturalizeDataset(
            minimalDataset
        );
        const part10Buffer = dicomDict.write();
        const dicomData = DicomMessage.readFile(part10Buffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(
            dicomData.dict
        );

        expect(dataset.TrialName).to.equal("Test Trial");
        //check that all other fields were preserved, 15 original + 1 for _vr and +1 for "TrialName"
        expect(Object.keys(dataset).length).to.equal(17)
        console.log("Finished test_custom_dictionary");
    },
};

exports.test = async testToRun => {
    Object.keys(tests).forEach(testName => {
        if (
            testToRun &&
            !testName.toLowerCase().includes(testToRun.toLowerCase())
        ) {
            console.log("-- Skipping " + testName);
            return false;
        }
        console.log("-- Starting " + testName);
        tests[testName]();
    });
};

exports.tests = tests;
