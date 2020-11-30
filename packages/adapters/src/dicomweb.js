import log from "./log.js";

class DICOMWEB {
    /*
    JavaScript DICOMweb REST API for browser use.

    Design:
    * map rest api to high-level code with modern conventions
    ** ES6: classes, arrow functions, let...
    ** promises
    ** json converted to objects

   examples: see tests() method below.

  */

    constructor(options = {}) {
        this.rootURL = options.rootURL;
        this.progressCallback = options.progressCallback;
    }

    static responseType(endpoint) {
        const types = {
            wado: "arraybuffer"
        };
        return types[endpoint] ? types[endpoint] : "json";
    }

    // which URL service to use for each of the high level services
    static endpointService(endpoint) {
        const services = {
            wado: ""
        };
        return Object.keys(services).indexOf(endpoint) != -1
            ? services[endpoint]
            : "rs/";
    }

    static randomEntry(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    request(endpoint, parameters = {}, payload) {
        let responseType = DICOMWEB.responseType(endpoint);
        let service = DICOMWEB.endpointService(endpoint);
        let url = this.rootURL + "/" + service + endpoint;
        let firstParameter = true;
        Object.keys(parameters).forEach(parameter => {
            if (firstParameter) {
                url += "?";
                firstParameter = false;
            } else {
                url += "&";
            }
            url += parameter + "=" + encodeURIComponent(parameters[parameter]);
        });
        function promiseHandler(resolve, reject) {
            let request = new XMLHttpRequest();
            request.open("GET", url);
            request.responseType = responseType;
            request.onload = () => {
                resolve(request.response);
            };
            request.onprogress = this.progressCallback;
            request.onerror = error => {
                log.error(request.response);
                reject(error);
            };
            request.send(payload);
        }
        let promise = new Promise(promiseHandler.bind(this));
        return promise;
    }

    patients() {
        return this.request("patients");
    }

    studies(patientID) {
        return this.request("studies", { PatientID: patientID });
    }

    series(studyInstanceUID) {
        return this.request("series", { StudyInstanceUID: studyInstanceUID });
    }

    instances(studyInstanceUID, seriesInstanceUID) {
        return this.request("instances", {
            StudyInstanceUID: studyInstanceUID,
            SeriesInstanceUID: seriesInstanceUID
        });
    }

    instance(studyInstanceUID, seriesInstanceUID, sopInstanceUID) {
        return this.request("wado", {
            requestType: "WADO",
            studyUID: studyInstanceUID,
            seriesUID: seriesInstanceUID,
            objectUID: sopInstanceUID,
            contentType: "application/dicom"
        });
    }

    tests() {
        let testingServerURL =
            "http://quantome.org:4242/dcm4chee-arc/aets/DCM4CHEE";
        let testOptions = { rootURL: testingServerURL };

        new DICOMWEB(testOptions).patients().then(responses => {
            responses.forEach(patient => {
                log.log(patient);
            });
        });
    }
}

export { DICOMWEB };
