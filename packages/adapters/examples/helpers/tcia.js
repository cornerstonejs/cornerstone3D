class TCIA {
  /*
    JavaScript TCIA REST API for browser use.

    Design:
    * map rest api to high-level code with modern conventions
    ** ES6: classes, arrow functions, let...
    ** promises
    ** json converted to objects

   examples: see tests() method below.

  */

  constructor(options={}) {
    this.tciaTestURL = 'https://services-test.cancerimagingarchive.net/services/v3/TCIA/'
    //this.tciaURL = 'https://services.cancerimagingarchive.net/services/v3/TCIA/TCIA'
    this.tciaURL = 'https://services.cancerimagingarchive.net/services/TCIA/TCIA'
    this.tciaURL = options.url || 'https://services.cancerimagingarchive.net/services/v4/TCIA';

    this.slicerAPIKey = 'f88ff53d-882b-4c0d-b60c-0fb560e82cf1';

    this.progressCallback = options.progressCallback;
  }

  static responseType(endpoint) {
    const types = {
      getImage: 'arraybuffer',
    };
    return( types[endpoint] ? types[endpoint] : 'json' );
  }

  static randomEntry(array) {
    return array[Math.floor(Math.random() * (array.length))];
  }

  request(endpoint, parameters={}, payload) {
    let responseType = TCIA.responseType(endpoint);
    let url = this.tciaURL + '/query/' + endpoint + '?api_key=' + this.slicerAPIKey;
    Object.keys(parameters).forEach(parameter => {
      url += "&" + parameter + "=" + window.encodeURIComponent(parameters[parameter]);
    });
    function promiseHandler(resolve, reject) {
      let request = new XMLHttpRequest();
      request.open("GET", url)
      request.responseType = responseType;
      request.onload = event => {
        resolve(request.response);
      }
      request.onprogress = this.progressCallback;
      request.onerror = event => {
        console.error(request.response);
      }
      request.send(payload);
    }
    let promise = new Promise(promiseHandler.bind(this));
    return promise;
  }

  collections() {
    return(this.request('getCollectionValues'));
  }

  patients(collection) {
    return(this.request('getPatient', {Collection: collection}));
  }

  studies(patientID) {
    return(this.request('getPatientStudy', {PatientID: patientID}));
  }

  series(studyInstanceUID) {
    return(this.request('getSeries', {StudyInstanceUID: studyInstanceUID}));
  }

  images(seriesInstanceUID) {
    return(this.request('getImage', {SeriesInstanceUID: seriesInstanceUID}));
  }

  instances(seriesInstanceUID) {
    console.error('Not yet working');
    //return(this.request('getSOPInstanceUIDs', {SeriesInstanceUID: seriesInstanceUID}));
  }

  randomImages(status=function(){}) {
    return this.collections().then(collections => {
      let collection = TCIA.randomEntry(collections);
      status('looking in ' + JSON.stringify(collection) + '...');
      return this.patients(collection.Collection).then(patients => {
        let patient = TCIA.randomEntry(patients);
        status('looking in ' + JSON.stringify(patient) + '...');
        return this.studies(patient.PatientID).then(studies => {
          let study = TCIA.randomEntry(studies);
          status('looking in ' + JSON.stringify(study) + '...');
          return this.series(study.StudyInstanceUID).then(series => {
            let seriesUID = TCIA.randomEntry(series);
            status('loading ' + JSON.stringify(seriesUID));
            return(this.images(seriesUID.SeriesInstanceUID));
          });
        });
      });
    });
  }

  tests() {

    new TCIA().collections().then(console.log);

    new TCIA().collections().then(response => {
      response.forEach(collection => {
        console.log(collection.Collection);
      });
    });

    new TCIA().patients('TCGA-GBM').then(response => {
      response.forEach(patient => {
        console.log(patient);
      });
    });

    new TCIA().studies('TCGA-02-0060').then(response => {
      response.forEach(study => {
        console.log(study);
      });
    });

    let studyInstanceUID = "1.3.6.1.4.1.14519.5.2.1.1706.4001.247522006211308616726493960307";
    new TCIA().series(studyInstanceUID).then(response => {
      response.forEach(serie => {
        console.log(serie);
      });
    });

    let seriesInstanceUID = "1.3.6.1.4.1.14519.5.2.1.1706.4001.224456696643192351722858299392";
    new TCIA().images(seriesInstanceUID).then(response => {
      console.log('Size of response is ', response.byteLength);
    });

    new TCIA().randomImages().then(images => {
      console.log('Size of response is ', images.byteLength);
    });

  }

}
