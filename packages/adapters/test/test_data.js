const expect = require('chai').expect;
const dcmjs = require('../build/dcmjs');

const fs = require("fs");
const {http, https} = require("follow-redirects");
const os = require("os");
const path = require("path");
const unzipper = require("unzipper");

const { DicomMetaDictionary, DicomDict, DicomMessage } = dcmjs.data;

const fileMetaInformationVersionArray = new Uint8Array(2);
fileMetaInformationVersionArray[1] = 1;

const metadata = {
  "00020001": {
      "Value": [
        fileMetaInformationVersionArray.buffer
      ],
      "vr": "OB"
  },
  "00020012": {
      "Value": [
          "1.2.840.113819.7.1.1997.1.0"
      ],
      "vr": "UI"
  },
  "00020002": {
      "Value": [
          "1.2.840.10008.5.1.4.1.1.4"
      ],
      "vr": "UI"
  },
  "00020003": {
      "Value": [
          DicomMetaDictionary.uid()
      ],
      "vr": "UI"
  },
  "00020010": {
      "Value": [
          "1.2.840.10008.1.2"
      ],
      "vr": "UI"
  }
};

function downloadToFile(url, filePath) {
  return new Promise( (resolve,reject) => {
    const fileStream = fs.createWriteStream(filePath);
    const request = https.get(url, (response) => {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        resolve(filePath);
      });
    }).on('error', reject);
  });
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
    const firstUID = datasets[0]['0020000D'].Value[0];
    const secondUID = datasets[1]['0020000D'].Value[0];

    //
    // make a natural version of the first study and confirm it has correct value
    //
    const naturalDICOM = DicomMetaDictionary.naturalizeDataset(datasets[0]);

    expect(naturalDICOM.StudyInstanceUID).to.equal(firstUID);

    //
    // convert to part10 and back
    //
    const dicomDict = new DicomDict(metadata);
    dicomDict.dict = datasets[1];
    const part10Buffer = dicomDict.write();

    const dicomData = dcmjs.data.DicomMessage.readFile(part10Buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

    expect(dataset.StudyInstanceUID).to.equal(secondUID);
    console.log("Finished test_json_1");
  },

  test_multiframe_1: () => {

    const url = "https://github.com/dcmjs-org/data/releases/download/MRHead/MRHead.zip";
    const zipPath = path.join(os.tmpdir(), "MRHead.zip");
    const unzipPath = path.join(os.tmpdir(), "test_multiframe_1");

    downloadToFile(url, zipPath)
      .then( () => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Extract( {path: unzipPath} )
            .on('close', () => {
              const mrHeadPath = path.join(unzipPath, "MRHead");
              fs.readdir(mrHeadPath, (err, fileNames) => {
                expect(err).to.equal(null);
                const datasets = [];
                fileNames.forEach(fileName => {
                  const arrayBuffer = fs.readFileSync(path.join(mrHeadPath, fileName)).buffer;
                  const dicomDict = DicomMessage.readFile(arrayBuffer);
                  const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
                  datasets.push(dataset);
                });

                const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset(datasets);
                const spacing = multiframe.SharedFunctionalGroupsSequence.PixelMeasuresSequence.SpacingBetweenSlices;
                const roundedSpacing = Math.round(100 * spacing) / 100;

                expect(multiframe.NumberOfFrames).to.equal(130);
                expect(roundedSpacing).to.equal(1.3);
                console.log("Finished test_multiframe_1");
              })
            })
          );
      });
  },
}


exports.test = async () => {
  Object.keys(tests).forEach(testName => {
    console.log("-- Starting " + testName);
    tests[testName]();
  });
}

