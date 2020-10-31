# Thresholdmann

A Web tool for interactively creating adaptive thresholds to segment MRI data.

Katja Heuer & Roberto Toro, April 2018

[![CircleCI](https://circleci.com/gh/neuroanatomy/thresholdmann.svg?style=shield)](https://circleci.com/gh/neuroanatomy/thresholdmann)


Simply drag & drop your MRI file for display in an interactive stereotaxic viewer. Add a control point and grow or shrink your selection from there.
You can later re-select and adjust control points or delete them. Once you are happy with your selection, you can download the control points (json) and you can download the mask (`.nii.gz`).

<img src="https://user-images.githubusercontent.com/6297454/41974463-4c29f89c-7a18-11e8-8617-558869b13299.gif" width="100%" />

Brain extraction and segmentation are required for any downstream analysis of neuroimaging data. Obtaining appropriate masks can be particularly difficult in non-human brain imaging, as standard automatic tools struggle with the surrounding muscle tissue, skull, and strong luminosity gradients. A simple interactive threshold is intuitive and fast to apply, and can often provide a rather good initial guess. However, because of luminosity gradients, the threshold that works for a brain region is likely to fail in another.

[Thresholdmann](https://neuroanatomy.github.io/thresholdmann) is an open source Web tool for the interactive application of space-varying thresholds to nifti volumes (no download or installation are required, all processing is done in the user’s computer). Nifti volumes are dragged onto the Web app and become available for visual exploration in a stereotaxic viewer. A space-varying threshold is then created by setting control points, each with their own local threshold. The viewer is initialised with one control point at the center of the brain. The addition of further control points produces a space-varying threshold obtained through radial basis function interpolation. Each local threshold can be adjusted in real time using sliders. Finally, the thresholded mask, the space varying threshold and the list of control points can be saved for later use in scripted workflows.

Thresholdmann complements the variety of existing brain segmentation tools, providing an easy interface to manually control the segmentation on a local scale. The masks produced by Thresholdmann can serve as a starting point for more detailed manual editing using tools such as [BrainBox](https://brainbox.pasteur.fr)  or [ITK Snap](http://www.itksnap.org). This interactive approach is especially valuable for non-human brain imaging data, where automatic approaches often require extensive manual adjustment anyway. We have used Thresholdmann successfully to create initial brain masks for a variety of vertebrate brains – including many non-human primate datasets (Heuer et al. 2019) – as well as developmental data.

### Doc
A description of a typical workflow can be found in the [doc](https://neuroanatomy.github.io/thresholdmann/doc.html).
