const dicomMap = new Map();

// dicomMap.set(
//     "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
//     {
//         fetchDicom: {
//             StudyInstanceUID:
//                 "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
//             SeriesInstanceUID:
//                 "1.3.6.1.4.1.14519.5.2.1.40445112212390159711541259681923198035",
//             wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
//         },
//         fetchSegmentation: {
//             StudyInstanceUID:
//                 "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
//             SeriesInstanceUID:
//                 "1.2.276.0.7230010.3.1.3.481034752.2667.1663086918.611582",
//             SOPInstanceUID:
//                 "1.2.276.0.7230010.3.1.4.481034752.2667.1663086918.611583",
//             wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
//         }
//     }
// );
// dicomMap.set("1.3.6.1.4.1.32722.99.99.71961866280433925571019872464419293819", {
//     fetchDicom: {
//         StudyInstanceUID:
//             "1.3.6.1.4.1.32722.99.99.71961866280433925571019872464419293819",
//         SeriesInstanceUID:
//             "1.3.6.1.4.1.32722.99.99.34905847539837720676301269477428468747",
//         wadoRsRoot:
//             "https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb"
//     },
//     fetchSegmentation: {
//         StudyInstanceUID:
//             "1.3.6.1.4.1.32722.99.99.71961866280433925571019872464419293819",
//         SeriesInstanceUID:
//             "1.2.276.0.7230010.3.1.3.2323910823.11644.1597260534.485",
//         SOPInstanceUID:
//             "1.2.276.0.7230010.3.1.4.2323910823.11644.1597260534.486",
//         wadoRsRoot:
//             "https://proxy.imaging.datacommons.cancer.gov/current/viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb"
//     }
// });

dicomMap.set(
    "1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520",
    {
        fetchDicom: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520",
            SeriesInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.3671.4754.235188122843915982710753948536",
            wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
        },
        fetchSegmentation: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.3671.4754.298665348758363466150039312520",
            SeriesInstanceUID:
                "1.2.276.0.7230010.3.1.3.1426846371.15380.1513205183.303",
            SOPInstanceUID:
                "1.2.276.0.7230010.3.1.4.1426846371.15380.1513205183.304",
            wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
        }
    }
);
// dicomMap.set("1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046", {
//     fetchDicom: {
//         StudyInstanceUID:
//             "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
//         SeriesInstanceUID:
//             "1.3.12.2.1107.5.2.32.35162.1999123112191238897317963.0.0.0",
//         wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
//     },
//     fetchSegmentation: {
//         StudyInstanceUID:
//             "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
//         SeriesInstanceUID:
//             "1.2.276.0.7230010.3.1.3.296485376.8.1542816659.201008",
//         SOPInstanceUID: "1.2.276.0.7230010.3.1.4.296485376.8.1542816659.201009",
//         wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
//     }
// });

export { dicomMap };
