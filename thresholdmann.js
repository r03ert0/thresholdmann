/* eslint-disable radix */
/* eslint-disable no-alert */
/* eslint-disable max-lines */
/* eslint-disable max-statements */
/* global MUI, $, MRIViewer */

const globals = {
  mv: null,
  originalDraw: null,
  points: null,
  values: null,
  rbf: null,
  selectedControlPoint: null,
  selectedTool: "Select",
  selectedDirection: "SelectUp",
  selectedOverlay: "Threshold Mask"
};
window.globals = globals;

const interpolation = (pos) => {
  const {points, values} = globals;
  let val = 0;
  let totalw = 0;
  for (let k=0; k<points.length; k++) {
    const d =
      (pos[0] - points[k][0]) ** 2 +
      (pos[1] - points[k][1]) ** 2 +
      (pos[2] - points[k][2]) ** 2;
    const w = 1 / (d + 0.001);
    val += w * values[k];
    totalw += w;
  }

  return val / totalw;
};
globals.rbf = interpolation;

/*
const initRBF = (points, values) => {
  // - linear: r
  // - cubic: r**3
  // - quintic: r**5
  // - thin-plate: r**2 * log(r)
  // - gaussian: exp(-(r/epsilon) ** 2)
  // - multiquadric: sqrt((r/epsilon) ** 2 + 1)
  // - inverse-multiquadric: 1 / sqrt((r/epsilon) ** 2 + 1)
  // epsilon can be provided as a 4th parameter. Defaults to the average
  // euclidean distance between points.
  // eslint-disable-next-line new-cap
  globals.rbf = RBF(points, values, 'linear'); //, epsilon);
};
*/

const displayControlPointsTable = () => {
  let i;
  const {points, values} = globals;
  const cpid = globals.selectedControlPoint;
  let cpidIndex = -1;
  if (cpid) {
    cpidIndex = globals.selectedControlPoint.replace("cp", "")|0;
  }

  // display control point table
  let str = "";
  for(i=0; i<points.length; i++) {
    str += `
<tr onclick="selectRow(this)" ${(cpidIndex === i)?'class="selected"':''}>
  <td class="ijk">${points[i][0]}</td>
  <td class="ijk">${points[i][1]}</td>
  <td class="ijk">${points[i][2]}</td>
  <td class="slider-val"><input type="range" step='any' min=0 max=255 data-ijk="${points[i][0]},${points[i][1]},${points[i][2]}" value=${values[i]} oninput="changeThreshold(this)"/></td>
  <td class="text-val"><input class="value" min=0 max=255 value="${values[i].toFixed(0)}" /></td>
</tr>
`;
  }
  document.querySelector('#control table tbody').innerHTML = str;
};

const displayControlPoints = () => {
  const {mv} = globals;
  if(typeof globals.points === 'undefined') {
    return;
  }

  let i, slice, x, y;
  const [{plane}] = globals.mv.views;
  $('.cpoint').remove();
  // document.querySelector(".cpoint").remove();

  const {W, H} = mv.dimensions.voxel[plane];
  for(i=0; i<globals.points.length; i++) {
    // eslint-disable-next-line new-cap
    const s = globals.mv.IJK2S(globals.points[i]);
    switch (plane) {
    case 'sag': [slice, x, y] = [s[0], s[1], H - 1 - s[2]]; break;
    case 'cor': [x, slice, y] = [s[0], s[1], H - 1 - s[2]]; break;
    case 'axi': [x, y, slice] = [s[0], H - 1 - s[1], s[2]]; break;
    }
    if(slice !== globals.mv.views[0].slice) {
      continue;
    }
    x = 100*(0.5+x)/W;
    y = 100*(0.5+y)/H;

    const str = `<div class="cpoint" id="cp${i}" data-ijk="${globals.points[i][0]},${globals.points[i][1]},${globals.points[i][2]}" style="left:${x}%;top:${y}%"></div>`;

    // this works:
    $('#viewer .wrap').append(str);
    // this bugs:
    // document.querySelector('#viewer > .wrap').innerHTML += str;
  }
};

/** Save a 3D image volume in Nifti format.
 * @param {Float32Array} data - the image volume
 * @returns {void}
 */
const saveNifti = (data) => {
  const {mv} = globals;
  const niigz = mv.mri.createNifti(mv.mri.dim, mv.mri.pixdim, mv.mri.vox2mm(), data);
  const name = prompt("Save mask as...", "mask.nii.gz");
  if(name !== null) {
    mv.mri.saveNifti(niigz, name);
  }
};

/** Threshold a complete 3D image volume in a web worker
 * @returns {void}
*/
const thresholdJob = () => {
  const worker = new Worker("thresholdmann-worker.js");
  worker.onmessage = function(e) {
    var {msg} = e.data;
    switch(msg) {
    case 'success':
      console.log("Worker finished");
      var data = e.data.mask;
      saveNifti(data);
      document.querySelector("#progress").innerText = 'Done';
      setTimeout( () => {
        document.querySelector("#progress").innerText = "";
        document.querySelector("#progress").style.display = "none";
      }, 2000);
      break;
    case 'progress': {
      const v = e.data.value.split(',').map( (x) => parseInt(x) );
      document.querySelector("#progress").innerText = `Saving ${v[0]+1} out of ${v[1]}`;
      break;
    }
    default:
      console.log("wrkr: " + e.data.msg);
    }
  };
  console.log("Start worker");
  document.querySelector("#progress").style.display = "inline-block";
  worker.postMessage({
    cmd: "start",
    mri: globals.mv.mri.data,
    dim: globals.mv.mri.dim,
    maxValue: globals.mv.maxValue,
    points: globals.points,
    values: globals.values,
    direction: (globals.selectedDirection === "SelectUp")
  });
};

const _screenCoord = (plane, x, y, slice, H) => {
  let s;
  switch(plane) {
  case 'sag':
    s = [slice, x, H - 1 - y];
    break;
  case 'cor':
    s = [x, slice, H - 1 - y];
    break;
  case 'axi':
    s = [x, H - 1 - y, slice];
    break;
  }

  return s;
};

const _setPixelFromValue = (px, ind, val, selectedOverlay) => {
  const g = px.data[4*ind+0];
  if(selectedOverlay === 'Threshold Mask') {
    if (globals.selectedDirection === "SelectUp") {
      px.data[4*ind+0] = (g>=val)?255:g;
    } else {
      px.data[4*ind+0] = (g<=val)?255:g;
    }
    px.data[4*ind+1] = g;
    px.data[4*ind+2] = g;
  } else {
    px.data[4*ind+0] = val|0;
    px.data[4*ind+1] = val|0;
    px.data[4*ind+2] = val|0;
    px.data[4*ind+3] = 255;
  }
};

const threshold = () => {
  const {mv, rbf, selectedOverlay} = globals;
  if(typeof rbf === 'undefined') {
    return;
  }

  let ind, s, x, y;
  const [{canvas, plane, slice}] = mv.views;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const {width, height} = canvas;
  const {W, H} = mv.dimensions.voxel[plane];
  const px = ctx.getImageData(0, 0, width, height);
  for(x=0; x<W; x++) {
    for(y=0; y<H; y++) {
      s = _screenCoord(plane, x, y, slice, H);
      ind = y*width + x;
      _setPixelFromValue(
        // eslint-disable-next-line new-cap
        px, ind, rbf(mv.S2IJK(s)), selectedOverlay);
    }
  }
  ctx.putImageData(px, 0, 0);
};

const clickOnViewer = (ev) => {
  const {mv, rbf} = globals;
  const rect = $('canvas.viewer')[0].getBoundingClientRect();
  const x = mv.views[0].canvas.width * (ev.clientX - rect.left)/rect.width|0;
  const y = mv.views[0].canvas.height * (ev.clientY - rect.top)/rect.height|0;
  const [{slice, plane}] = mv.views;
  let s;
  const {H} = mv.dimensions.voxel[plane];

  switch (plane) {
  case 'sag': s = [slice, x, H - 1 - y]; break;
  case 'cor': s = [x, slice, H - 1 - y]; break;
  case 'axi': s = [x, H - 1 - y, slice]; break;
  }
  // eslint-disable-next-line new-cap
  const [i, j, k] = mv.S2IJK(s);

  switch(globals.selectedTool) {
  case 'Select':
    console.log([i, j, k], rbf([i, j, k]));
    break;
  case 'Add':
    globals.points.push([i, j, k]);
    globals.values.push(127);
    // initRBF(globals.points, globals.values);
    displayControlPointsTable();
    mv.draw();
    break;
  }
};

const selectControlPoint = (cpid) => {
  $('.cpoint.selected').removeClass('selected');
  $('#'+cpid).addClass('selected');
};

const selectThresholdSlider = (cpid) => {
  const data = $('#'+cpid).data().ijk;
  $('tr.selected').removeClass('selected');
  $(`#control tr input[data-ijk="${data}"]`).closest('tr')
    .addClass('selected');
};

/** Handle clicking on a row of the control points table
 * @param {HTMLElement} trSelected - the row element
 * @returns {void}
*/
// eslint-disable-next-line no-unused-vars
const selectRow = (trSelected) => {
  document.querySelectorAll('tr.selected').forEach( (tr) => {
    tr.classList.remove('selected');
  });
  trSelected.classList.add('selected');

  const {mv} = globals;
  const [{plane}] = mv.views;
  let slice;

  const ijk = trSelected.querySelector('input[type="range"]').dataset.ijk.split(',').map((x) => parseInt(x));

  switch(plane) {
  case 'sag':
    [slice] = ijk;
    break;
  case 'cor':
    [, slice] = ijk;
    break;
  case 'axi':
    [, , slice] = ijk;
    break;
  }
  mv.setSlice(mv.views[0], slice);
};

/** Handle changes in threshold triggered by the sliders
 * in the control points table.
 * @param {HTMLElement} ob - the slider element
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const changeThreshold = (ob) => {
  const {mv} = globals;
  const val = parseFloat(ob.value);
  const data = $(ob).data().ijk;
  const cpid = $(`[data-ijk="${data}"]`).attr('id');

  ob.parentElement.nextElementSibling.querySelector("input").value = val.toFixed(0);

  let i;
  for(i=globals.points.length-1; i>=0; i--) {
    if(data === globals.points[i][0]+','+globals.points[i][1]+','+globals.points[i][2]) {
      globals.values[i] = val;
    }
  }
  // initRBF(globals.points, globals.values);
  mv.draw();
  selectControlPoint(cpid);
  selectThresholdSlider(cpid);
};

const controlPointMoveHandler = (ev) => {
  if (globals.selectedTool !== "Move") {
    return;
  }

  if(globals.selectedControlPoint === null) {
    return;
  }

  const cpid = globals.selectedControlPoint;
  const cpidIndex = cpid.replace("cp", "")|0;
  const {mv} = globals;
  const rect = $('canvas.viewer')[0].getBoundingClientRect();
  const x = mv.views[0].canvas.width * (ev.clientX - rect.left)/rect.width|0;
  const y = mv.views[0].canvas.height * (ev.clientY - rect.top)/rect.height|0;
  const [{slice, plane}] = mv.views;
  let s;
  const {H} = mv.dimensions.voxel[plane];

  switch (plane) {
  case 'sag': s = [slice, x, H - 1 - y]; break;
  case 'cor': s = [x, slice, H - 1 - y]; break;
  case 'axi': s = [x, H - 1 - y, slice]; break;
  }
  // eslint-disable-next-line new-cap
  const [i, j, k] = mv.S2IJK(s);

  globals.points[cpidIndex][0] = i;
  globals.points[cpidIndex][1] = j;
  globals.points[cpidIndex][2] = k;
  displayControlPointsTable();
  mv.draw();


  //   if (cpid.match(/cp[\d]+/) === null) {
  //     return;
  //   }

  //   if($('#'+cpid).hasClass('selected') === false) {
  //     console.log("controlPointMoveHandler: not selected");
  //   }
};

const controlPointUpHandler = (ev) => {
  console.log("Up");
  const {mv} = globals;
  const cpid = ev.target.id;

  if (cpid.match(/cp[\d]+/) === null) {
    return;
  }

  switch(globals.selectedTool) {
  case 'Select':
    selectControlPoint(cpid);
    selectThresholdSlider(cpid);
    break;
  case 'Remove': {
    let i;
    const data = $('#'+cpid).data().ijk;
    for(i=globals.points.length-1; i>=0; i--) {
      if(data === globals.points[i][0]+','+globals.points[i][1]+','+globals.points[i][2]) {
        globals.points.splice(i, 1);
        globals.values.splice(i, 1);
      }
    }
    // initRBF(globals.points, globals.values);
    displayControlPointsTable();
    mv.draw();
    break;
  }
  }

  globals.selectedControlPoint = null;
  console.log("Up");
};

const controlPointDownHandler = (ev) => {
  console.log("controlPointDownHandler", ev.target.id);
  const cpid = ev.target.id;
  if (cpid.match(/cp[\d]+/) === null) {

    return;
  }

  if (globals.selectedTool === "Move") {
    globals.selectedControlPoint = cpid;
    selectControlPoint(cpid);
  }
};

/** Save the selection mask produced by the
 * threshold. The computation is done in a
 * web worker.
 * @returns {void}
 */
const saveMask = () => {
  thresholdJob();
};

/** Save the selection mask produced by the
 * threshold, but in the main thread.
 * @deprecated
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const saveMaskOLD = () => {
  const {mv, rbf} = globals;
  const [dim] = mv.mri;
  const data = new Float32Array(dim[0]*dim[1]*dim[2]);
  let val;
  let i, j, k;
  let ijk;
  for(i=0; i<dim[0]; i++) {
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        ijk = k*dim[1]*dim[0] + j*dim[0] + i;
        val = rbf([i, j, k])*mv.maxValue/255;

        if(mv.mri.data[ijk] <= val) {
          data[ijk] = 0;
        } else {
          data[ijk] = 1;
        }
      }
    }
  }
  saveNifti(data);
};


const saveControlPoints = () => {
  var a = document.createElement('a');
  const {points, values} = globals;
  const ob = { points, values };
  a.href = 'data:application/json;charset=utf-8,' + JSON.stringify(ob);
  const name = prompt("Save Control Points As...", "control-points.json");
  if(name !== null) {
    a.download = name;
    document.body.appendChild(a);
    a.click();
  }
};

/** Load control points from a text file.
 * The control point positions and values are stored
 * in `globals`.
 * @returns {void}
 */
const loadControlPoints = () => {
  var input = document.createElement("input");
  input.type = "file";
  input.onchange = () => {
    const [file] = this.files;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const str = ev.target.result;
      const ob = JSON.parse(str);
      globals.points = ob.points;
      globals.values = ob.values;
      // initRBF(globals.points, globals.values);
      displayControlPointsTable();
      globals.mv.draw();
    };
    reader.readAsText(file);
  };
  input.click();
};

/** Adds new plane selection buttons and connects them
 * to the MRIViewer.
 * @returns {void}
 */
const _newPlaneSelectionUI = () => {
  const {mv} = globals;
  const view = document.querySelector('#viewer');

  // append button after all elements already present in the div#viewer
  view.insertAdjacentHTML('beforeend', `
    <button class="sag-btn active">Sagittal</button>
    <button class="axi-btn">Axial</button>
    <button class="cor-btn">Coronal</button>
  `);
  const sagBtn = view.querySelector('.sag-btn');
  const axiBtn = view.querySelector('.axi-btn');
  const corBtn = view.querySelector('.cor-btn');
  sagBtn.addEventListener('click', function () {
    mv.setPlane(mv.views[0], 'sag');
    //view.slider.max = mv.dimensions[mv.space].sag.maxSlice;
    mv.configureSliders();
    sagBtn.classList.add('active');
    axiBtn.classList.remove('active');
    corBtn.classList.remove('active');
  });
  axiBtn.addEventListener('click', function () {
    mv.setPlane(mv.views[0], 'axi');
    //view.slider.max = mv.dimensions[mv.space].axi.maxSlice;
    mv.configureSliders();
    sagBtn.classList.remove('active');
    axiBtn.classList.add('active');
    corBtn.classList.remove('active');
  });
  corBtn.addEventListener('click', function () {
    mv.setPlane(mv.views[0], 'cor');
    //view.slider.max = mv.dimensions[mv.space].cor.maxSlice;
    sagBtn.classList.remove('active');
    axiBtn.classList.remove('active');
    corBtn.classList.add('active');
    mv.configureSliders();
  });
};

const initUI = () => {
  const {mv} = globals;
  // Default control Points
  globals.points = [];
  globals.values = [];
  for (let iter=0; iter<10; iter++) {
    globals.points.push([
      (Math.random() * mv.mri.dim[0])|0,
      (Math.random() * mv.mri.dim[1])|0,
      (Math.random() * mv.mri.dim[2])|0
    ]);
    globals.values.push(100 + Math.random() * 40);
  }
  // initRBF(globals.points, globals.values);
  displayControlPointsTable();

  globals.mv.draw = function draw() {
    globals.originalDraw();
    threshold();
    displayControlPoints();
  };

  mv.maxValue *= 1.1;
  mv.draw();

  // Listen to control point clicks
  $('body').on('mouseup', controlPointUpHandler);
  $('body').on('mousedown', '.cpoint', controlPointDownHandler);
  $('body').on('mousemove', controlPointMoveHandler);

  // Listen to canvas clicks
  $('body').on('click', 'canvas', clickOnViewer);

  document.querySelector("#panels").style.display = "flex";
  $('#tools, #direction, #overlay, #saveMask, #saveControlPoints, #loadControlPoints').show();
  $('#upload-box').removeClass('init');

  // Initialise UI
  MUI.chose($('#tools'), (option) => {
    globals.selectedTool = option;
    switch(globals.selectedTool) {
    case "Add":
      break;
    case "Remove":
      break;
    }
  });
  MUI.chose($('#direction'), (option) => {
    globals.selectedDirection = option;
    switch(globals.selectedDirection) {
    case "SelectUp":
      console.log("SelectUp");
      break;
    case "SelectDown":
      console.log("SelectDown");
      break;
    }
    mv.draw();
  });
  MUI.chose($('#overlay'), (option) => {
    globals.selectedOverlay = option;
    globals.mv.draw();
  });
  MUI.push($('#saveMask'), saveMask);
  MUI.push($('#saveControlPoints'), saveControlPoints);
  MUI.push($('#loadControlPoints'), loadControlPoints);

  _newPlaneSelectionUI();
};

const _newMRIViewer = ({file, path}) => {
  globals.mv = new MRIViewer({
    mriFile: file,
    mriPath: path,
    space: 'voxel',
    views: [
      {
        elem: document.querySelector("#viewer"),
        width: 800,
        plane: 'sag',
        addPlaneSelect: false,
        addSpaceSelect: false
      }
    ]
  });
  globals.originalDraw = globals.mv.draw;
};

const _display = async () => {
  try {
    await globals.mv.display();
  } catch(err) {
    throw new Error(err);
  }
};

const init = async (file) => {
  _newMRIViewer({file});
  await _display();
  initUI();
};

/** Loads a Nifti file. This function is called from
 * the HTML page.
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const loadNifti = () => {
  var input = document.createElement("input");
  input.type = "file";
  input.onchange = function() {
    var [file] = this.files;
    console.log('loading', file);
    init(file);
  };
  input.click();
};

/** Handle initialisation when a path is provided.
 * @param {string} path - the path to the Nifti file
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const initWithPath = async (path) => {
  _newMRIViewer({path});
  await _display();
  initUI();
};

console.log(`
THRESHOLDMANN
to do:
- add a 3d render
- tests
`);
