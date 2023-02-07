<div align="center">
  <h1>Adapters for VTK, Cornerstone and Cornerstone3D</h1>
  <p>Conversion to/from the internal model and DICOM SR for annotations and other
  types of objects.</p>
</div>

<hr />

# History

- 2014
  - [DCMTK](dcmtk.org) cross compiled to javascript at [CTK Hackfest](http://www.commontk.org/index.php/CTK-Hackfest-May-2014). While this was useful and powerful, it was heavyweight for typical web usage.
- 2016
  - A [Medical Imaging Web Appliction meeting at Stanford](http://qiicr.org/web/outreach/Medical-Imaging-Web-Apps/) and [follow-on hackfest in Boston](http://qiicr.org/web/outreach/MIWS-hackfest/) helped elaborate the needs for manipulating DICOM in pure Javascript.
  - Based on [DICOM Part 10 read/write code](https://github.com/OHIF/dicom-dimse) initiated by Weiwei Wu of [OHIF](http://ohif.org), Steve Pieper [developed further features](https://github.com/pieper/sites/tree/gh-pages/dcmio) and [examples of creating multiframe and segmentation objects](https://github.com/pieper/sites/tree/gh-pages/DICOMzero) discussed with the community at RSNA
- 2017
  - At [NA-MIC Project Week 25](https://na-mic.org/wiki/Project_Week_25) Erik Ziegler and Steve Pieper [worked](https://na-mic.org/wiki/Project_Week_25/DICOM_Segmentation_Support_for_Cornerstone_and_OHIF_Viewer)
    with the community to define some example use cases to mix the pure JavaScript DICOM code with Cornerstone and [CornerstoneTools](https://github.com/chafey/cornerstoneTools).
- 2018-2022
  - Work continues to develop SR and SEG support to [OHIFViewer](http://ohif.org) allow interoperability with [DICOM4QI](https://legacy.gitbook.com/book/qiicr/dicom4qi/details)
- 2023
  - Moved the adapters into cornerstone3D from dcmjsj

# Support

The developers gratefully acknowledge their research support:

- Open Health Imaging Foundation ([OHIF](http://ohif.org))
- Quantitative Image Informatics for Cancer Research ([QIICR](http://qiicr.org))
- [Radiomics](http://radiomics.io)
- The [Neuroimage Analysis Center](http://nac.spl.harvard.edu)
- The [National Center for Image Guided Therapy](http://ncigt.org)
- The [NCI Imaging Data Commons](https://imagingdatacommons.github.io/) NCI Imaging Data Commons: contract number 19X037Q from Leidos Biomedical Research under Task Order HHSN26100071 from NCI
