<div align="center">
  <h1>dcmjs</h1>
  <p>JavaScript implementation of DICOM manipulation. This code is an outgrowth of several efforts to implement web applications for medical imaging.</p>
</div>

<hr />

[![CircleCI](https://circleci.com/gh/dcmjs-org/dcmjs.svg?style=svg)](https://circleci.com/gh/dcmjs-org/dcmjs)

**Note: this code is a work-in-progress and should not be used for production or clinical purposes**

See [live examples here](https://dcmjs.netlify.com/)

# Goals

_Overall the code should:_

- Support reading and writing of correct DICOM objects in JavaScript for browser or node environments
- Provide a programmer-friendly JavaScript environment for using and manipulating DICOM objects
- Include a set of useful demos to encourage correct usage of dcmjs and modern DICOM objects
- Encourage correct referencing of instances and composite context when creating derived objects
- Current target is modern web browsers, but a set of node-based utilities also makes sense someday

_Architectural goals include:_

- Use modern JavaScript programming methods (currently ES6) but avoid heavy frameworks
- Leverage modern DICOM standards but avoid legacy parts
- Support straightforward integration with multiple JavaScript deployment targets (browser, node, etc) and frameworks.

_Parts of DICOM that dcmjs will focus on:_

- Enhanced Multiframe Images
- Segmentation Objects
- Parametric Maps
- Structured Reports

_Parts of DICOM that dcmjs *will not* focus on:_

- DIMSE (legacy networking like C-STORE, C-FIND, C-MOVE, etc).  See the [dcmjs-dimse project](https://github.com/PantelisGeorgiadis/dcmjs-dimse) for that.
- Physical Media (optical disks).  See [this FAQ](https://www.dclunie.com/medical-image-faq/html/index.html) if you need to work with those.

# Usage

## In Browser

```html
<script type="text/javascript" src="https://unpkg.com/dcmjs"></script>
```

## In Node

```None
// To install latest _stable_ release
npm install --save dcmjs

// To install latest code merged to master
npm install --save dcmjs@dev
```

## For Developers

```None
git clone https://github.com/dcmjs-org/dcmjs
cd dcmjs
npm install
npm run build
npm test
```

## For Maintainers

Publish new version automatically from commit:

Use the following "Commit Message Format" when drafting commit messages. If you're merging a 3rd party's PR, you have the ability to override the supplied commit messages by doing a "Squash & Merge":

- [Commit Message Format](https://semantic-release.gitbook.io/semantic-release/#commit-message-format)

Note: Be wary of `BREAKING_CHANGE` in commit message descriptions, as this can force a major version bump.

Be sure to use lower case for the first letter of your semantic commit message, so use `fix` not `Fix` or `feat` not `Feat`.
It is advised to use the git-cz, i.e.:

- install git-cz

```
npm install -g git-cz
```

- how to commit

```
git-cz --non-interactive --type=fix --subject="commit message"
```

More info at [git-cz](https://www.npmjs.com/package/git-cz).

Note: a new package version will be published only if the commit comes from a PR.

## Community Participation

Use this repository's issues page to report any bugs. Please follow [SSCCE](http://sscce.org/) guidelines when submitting issues.

Use github pull requests to make contributions.

# Status

Currently dcmjs is an early-stage development experiment, but already has valuable functionality.

## Implemented

- Bidirectional conversion to and from part 10 binary DICOM and DICOM standard JSON encoding (as in [DICOMweb](http://dicomweb.org))
- Bidirectional convertion to and from DICOM standard JSON and a programmer-friendly high-level version (high-level form is called the "naturalized" form in the code).

## In development

- Creation of (correct) enhanced multiframe DICOM objects from legacy image objects
- Creation of (correct) derived DICOM objects such as Segmentations and Structured Reports

## TODO

- Create a test suite of input and output DICOM objects
- Test interoperability with other DICOM implementations
- Add documentation

# History

- 2014
  - [DCMTK](dcmtk.org) cross compiled to javascript at [CTK Hackfest](http://www.commontk.org/index.php/CTK-Hackfest-May-2014). While this was useful and powerful, it was heavyweight for typical web usage.
- 2016
  - A [Medical Imaging Web Appliction meeting at Stanford](http://qiicr.org/web/outreach/Medical-Imaging-Web-Apps/) and [follow-on hackfest in Boston](http://qiicr.org/web/outreach/MIWS-hackfest/) helped elaborate the needs for manipulating DICOM in pure Javascript.
  - Based on [DICOM Part 10 read/write code](https://github.com/OHIF/dicom-dimse) initiated by Weiwei Wu of [OHIF](http://ohif.org), Steve Pieper [developed further features](https://github.com/pieper/sites/tree/gh-pages/dcmio) and [examples of creating multiframe and segmentation objects](https://github.com/pieper/sites/tree/gh-pages/DICOMzero) discussed with the community at RSNA
- 2017
  - At [NA-MIC Project Week 25](https://na-mic.org/wiki/Project_Week_25) Erik Ziegler and Steve Pieper [worked](https://na-mic.org/wiki/Project_Week_25/DICOM_Segmentation_Support_for_Cornerstone_and_OHIF_Viewer)
    with the community to define some example use cases to mix the pure JavaScript DICOM code with Cornerstone and [CornerstoneTools](https://github.com/chafey/cornerstoneTools).
- 2018-2021
  - Work continues to develop SR and SEG support to [OHIFViewer](http://ohif.org) allow interoperability with [DICOM4QI](https://legacy.gitbook.com/book/qiicr/dicom4qi/details)

# Support

The developers gratefully acknowledge their research support:

- Open Health Imaging Foundation ([OHIF](http://ohif.org))
- Quantitative Image Informatics for Cancer Research ([QIICR](http://qiicr.org))
- [Radiomics](http://radiomics.io)
- The [Neuroimage Analysis Center](http://nac.spl.harvard.edu)
- The [National Center for Image Guided Therapy](http://ncigt.org)
- The [NCI Imaging Data Commons](https://imagingdatacommons.github.io/) NCI Imaging Data Commons: contract number 19X037Q from Leidos Biomedical Research under Task Order HHSN26100071 from NCI
