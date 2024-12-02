const dicomMap = new Map();

dicomMap.set(
    "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
    {
        fetchDicom: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
            SeriesInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.40445112212390159711541259681923198035",
            wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
        },
        fetchSegmentation: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
            SeriesInstanceUID:
                "1.2.276.0.7230010.3.1.3.481034752.2667.1663086918.611582",
            SOPInstanceUID:
                "1.2.276.0.7230010.3.1.4.481034752.2667.1663086918.611583",
            wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
        }
    }
);
dicomMap.set("1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046", {
    fetchDicom: {
        StudyInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
        SeriesInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.1999123112191238897317963.0.0.0",
        wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
    },
    fetchSegmentation: {
        StudyInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
        SeriesInstanceUID:
            "1.2.276.0.7230010.3.1.3.296485376.8.1542816659.201008",
        SOPInstanceUID: "1.2.276.0.7230010.3.1.4.296485376.8.1542816659.201009",
        wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb"
    }
});

export { dicomMap };
