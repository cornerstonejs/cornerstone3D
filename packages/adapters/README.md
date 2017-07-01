# dcmjs
Javascript implementation of DICOM manipulation

This code is an outgrowth of several efforts to implement web applications for medical imaging.

''Note: this code is a work-in-progress and should not be used for production or clinical purposes''

See [live examples here](https://pieper.github.io/dcmjs/examples/)

# Goals

Overall the code should:
* Support reading and writing of correct DICOM objects
* Provide a programmer-friendly JavaScript environment for using and manipulating DICOM objects
* Include a set of useful demos to encourage correct usage of dcmjs and modern DICOM objects

Architectural goals include:
* Use modern JavaScript programming methods but avoid heavy frameworks
* Leverage modern DICOM standards but avoid legacy parts

Parts of DICOM that dcmjs will focus on:
* Enhanced Multiframe Images
* Segmentation Objects
* Parametric Maps
* Structured Reports

Parts of DICOM that dcmjs ''will not'' focus on:
* DIMSE
* Physical Media

# History
* 2014
 * [DCMTK](dcmtk.org) cross compiled to javascript at [CTK Hackfest](http://www.commontk.org/index.php/CTK-Hackfest-May-2014).
While this was useful and powerful, it was heavyweight for typical web usage.
* 2016
 * A [Medical Imaging Web Appliction meeting at Stanford](http://qiicr.org/web/outreach/Medical-Imaging-Web-Apps/) and
[follow-on hackfest in Boston](http://qiicr.org/web/outreach/MIWS-hackfest/) helped elaborate the needs for manipulating DICOM in pure Javascript.
 * Based on DICOM Part 10 read/write code initiated by Weiwei Wu of [OHIF](ohif.org), Steve Pieper [developed further features](https://github.com/pieper/sites/tree/gh-pages/dcmio) and 
[examples of creating multiframe and segmentation objects](https://github.com/pieper/sites/tree/gh-pages/DICOMzero) discussed with
the community at RSNA
* 2017
 * At [NA-MIC Project Week 25](https://na-mic.org/wiki/Project_Week_25) Erik Ziegler and Steve Pieper [worked](https://na-mic.org/wiki/Project_Week_25/DICOM_Segmentation_Support_for_Cornerstone_and_OHIF_Viewer)
 with the community to define some example use cases to mix the pure JavaScript DICOM code with Cornerstone and [CornerstoneTools](https://github.com/chafey/cornerstoneTools).
 
 # Support
 The developers gratefully acknowledge their reseach support:
 * Open Health Imaging Foundation ([OHIF](ohif.org))
 * Quantitative Image Informatics for Cancer Research ([QIICR](qiicr.org))
 * [Radiomics](radomics.io)
 * [The Neuroimage Analysis Center](nac.spl.harvard.edu)
