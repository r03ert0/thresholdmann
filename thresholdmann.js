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
  interpolate: null,
  prevValue: null, // previous value of the threshold configured by the user
  alpha: 0.5,
  brightness: 1,
  contrast: 1,
  selectedControlPoint: null,
  selectedTool: "Select",
  selectedDirection: "SelectUp",
  selectedOverlay: "Threshold Mask"
};
window.globals = globals;

/** Interpolation function that creates a continuous
 * background from a set of control points.
 * @param {number[]} pos - a voxel coordinate
 * @returns {number} the interpolated value
 */
const interpolation = (pos) => {
  const {points, values} = globals;
  const backgroundValue = 255;
  const wBackground = 0.00001;
  let val = 0;
  let totalw = 0;

  // value from control points
  for (let k=0; k<points.length; k++) {
    const d =
      (pos[0] - points[k][0]) ** 2 +
      (pos[1] - points[k][1]) ** 2 +
      (pos[2] - points[k][2]) ** 2;
    const w = 1 / (d + 0.001);
    val += w * values[k];
    totalw += w;
  }

  // value from background
  val += wBackground * backgroundValue;
  totalw += wBackground;

  return val / totalw;
};
globals.interpolate = interpolation;

const displayControlPointsTable = () => {
  const {points, values, selectedControlPoint: cpid} = globals;
  let cpidIndex = -1;
  if (cpid) {
    cpidIndex = globals.selectedControlPoint.replace("cp", "")|0;
  }

  // display control point table
  let str = "";
  for(let ind=0; ind < points.length; ind++) {
    const [i, j, k] = points[ind];
    str += `
<tr onclick="selectRow(this)" data-cpid="cp${i}" data-ijk="${i},${j},${k}" ${(cpidIndex === ind)?'class="selected"':''}>
  <td class="ijk">${i}</td>
  <td class="ijk">${j}</td>
  <td class="ijk">${k}</td>
  <td class="slider-val">
    <input type="range" step="any" min=0 max=255 value=${values[ind]} oninput="changeThreshold(event)"/>
  </td>
  <td class="text-val">
    <input type="text" class="value" min=0 max=255 value="${values[ind].toFixed(0)}" onchange="inputThreshold(this)"/>
  </td>
</tr>
`;
  }
  document.querySelector('#control table tbody').innerHTML = str;
};

const slice2volume = (plane, x, y, slice, H) => {
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

const canvas2voxel = (ev) => {
  const {mv} = globals;
  const {left, top, width, height} = document.querySelector('canvas.viewer').getBoundingClientRect();
  const [{slice, plane}] = mv.views;
  const {W, H} = mv.dimensions.voxel[plane];
  const height2 = H * width / W;
  const offset = (height - height2)/2;
  const x = mv.views[0].canvas.width * (ev.clientX - left)/width|0;
  const y = mv.views[0].canvas.height * (ev.clientY - (top + offset))/height2|0;

  const s = slice2volume(plane, x, y, slice, H);

  return s;
};

/** Convert a voxel coordinate to a screen coordinate.
 * The screen coordinate is expressed in percentage of the
 * width and height of the MRI canvas.
 * @param {number[]} point - the voxel coordinate
 * @returns {number[]} the screen coordinate
 */
const voxel2canvas = (point) => {
  const {mv} = globals;

  // canvas.viewer includes the region containing the brain
  // but may also contain, in the height, a background region
  // appearing at the top and bottom. The transformation needs
  // to take these regions into account.
  const {width, height: heightLarge} = document.querySelector('canvas.viewer').getBoundingClientRect();
  const [{plane}] = mv.views;
  const {W, H} = mv.dimensions.voxel[plane];
  const height = H * width / W;
  const Hlarge = H * heightLarge / height;
  const offset = (Hlarge - H)/2;
  // eslint-disable-next-line new-cap
  const [i, j, k] = point;
  let slice, x, y;
  switch (plane) {
  case 'sag': [slice, x, y] = [i, j, H - 1 - k]; break;
  case 'cor': [x, slice, y] = [i, j, H - 1 - k]; break;
  case 'axi': [x, y, slice] = [i, H - 1 - j, k]; break;
  }

  // the x and y positions are computed as a proportion of the
  // larger canvas.
  x = 100 * (0.5 + x) / W;
  y = 100 * (0.5 + y + offset) / Hlarge;

  return [x, y, slice];
};

const displayControlPoints = () => {
  if(typeof globals.points === 'undefined') {
    return;
  }

  $('.cpoint').remove();
  // document.querySelector(".cpoint").remove();

  for(let i=0; i<globals.points.length; i++) {
    const [x, y, slice] = voxel2canvas(globals.points[i]);
    if(slice !== globals.mv.views[0].slice) {
      continue;
    }
    const str = `<div class="cpoint" id="cp${i}" data-ijk="${globals.points[i][0]},${globals.points[i][1]},${globals.points[i][2]}" style="left:${x}%;top:${y}%"></div>`;

    $('#viewer .wrap').append(str);
    // document.querySelector('#viewer > .wrap').innerHTML += str;
  }
};

/** Save a 3D image volume in Nifti format.
 * @param {Float32Array} data - the image volume
 * @returns {void}
 */
const saveNifti = (data) => {
  const {mv} = globals;
  const niigz = mv.mri.createNifti(
    mv.mri.dim,
    mv.mri.pixdim,
    mv.mri.vox2mm(),
    new Uint16Array(data)
  );
  const name = prompt("Save mask as...", "mask.nii.gz");
  if(name !== null) {
    mv.mri.saveNifti(niigz, name);
  }
};

const thresholdWorker = (callback) => {
  const worker = new Worker("thresholdmann-worker.js");
  worker.onmessage = function(e) {
    var {msg} = e.data;
    switch(msg) {
    case 'success':
      console.log("Worker finished");

      return callback(e.data.mask);
    case 'progress': {
      const v = e.data.value.split(',').map( (x) => parseInt(x) );
      document.querySelector("#progress").innerText = `Thresholding ${v[0]+1} out of ${v[1]}`;
      break;
    }
    default:
      console.log("wrkr: " + e.data.msg);
    }
  };
  console.log("Start worker");
  document.querySelector("#progress").style.display = "inline-block";
  const params = {
    cmd: "start",
    mri: globals.mv.mri.data,
    dim: globals.mv.mri.dim,
    maxValue: globals.mv.maxValue,
    points: globals.points,
    values: globals.values,
    directionUp: (globals.selectedDirection === "SelectUp")
  };
  worker.postMessage(params);
};

/** Threshold a complete 3D image volume in a web worker
 * @returns {void}
*/
const thresholdJob = () => {
  thresholdWorker((data) => {
    saveNifti(data);
    document.querySelector("#progress").innerText = 'Done';
    setTimeout( () => {
      document.querySelector("#progress").innerText = "";
      document.querySelector("#progress").style.display = "none";
    }, 2000);
  });
};

const _setPixelFromValue = (px, ind, val, selectedOverlay) => {
  const {alpha} = globals;
  const r = px.data[4*ind+0];
  const mr = alpha*255 + (1-alpha) * px.data[4*ind+0];
  if(selectedOverlay === 'Threshold Mask') {
    if (globals.selectedDirection === "SelectUp") {
      px.data[4*ind+0] = (r>=val)?mr:r;
    } else {
      px.data[4*ind+0] = (r<=val)?mr:r;
    }
    px.data[4*ind+1] = r;
    px.data[4*ind+2] = r;
  } else {
    px.data[4*ind+0] = val|0;
    px.data[4*ind+1] = val|0;
    px.data[4*ind+2] = val|0;
    px.data[4*ind+3] = 255;
  }
};

const threshold = () => {
  const {mv, interpolate, selectedOverlay} = globals;
  if(typeof interpolate === 'undefined') {
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
      s = slice2volume(plane, x, y, slice, H);
      ind = y*width + x;
      _setPixelFromValue(
        // eslint-disable-next-line new-cap
        px, ind, interpolate(/*mv.S2IJK(s)*/s), selectedOverlay);
    }
  }
  ctx.putImageData(px, 0, 0);
};

const selectThresholdSlider = (cpid) => {
  const {ijk} = document.querySelector(`#${cpid}`).dataset;
  if (document.querySelector("tr.selected")) {
    document.querySelector("tr.selected").classList.remove('selected');
  }
  const trSelected = document.querySelector(`#control tr[data-ijk="${ijk}"]`);
  trSelected.classList.add('selected');
  trSelected.scrollIntoView();
};

const addControlPoint = (i, j, k) => {
  const {mv} = globals;
  globals.points.push([i, j, k]);
  globals.values.push(globals.prevValue);
  displayControlPointsTable();
  globals.selectedControlPoint = "cp" + (globals.points.length-1);
  mv.draw();
  selectThresholdSlider(globals.selectedControlPoint);
};

const clickOnViewer = (ev) => {
  const [i, j, k] = canvas2voxel(ev);

  switch(globals.selectedTool) {
  case 'Select':
    break;
  case 'Add':
    addControlPoint(i, j, k);
    break;
  }
};

const selectControlPoint = (cpid) => {
  $('.cpoint.selected').removeClass('selected');
  $('#'+cpid).addClass('selected');
};



/** Handle clicking on a row of the control points table
 * @param {HTMLElement} trSelected - the row element
 * @returns {void}
*/
// eslint-disable-next-line no-unused-vars
const selectRow = (trSelected) => {
  // select the table row
  document.querySelectorAll('tr.selected').forEach( (tr) => {
    tr.classList.remove('selected');
  });
  trSelected.classList.add('selected');

  // set the slice
  const {mv} = globals;
  const [{plane}] = mv.views;
  let slice;
  const ijk = trSelected.dataset.ijk.split(',').map((x) => parseInt(x));
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

  // move the slider
  document.querySelector("input.slice").value = slice;

  // select the control point
  document.querySelectorAll('.cpoint').forEach( (cp) => {
    cp.classList.remove('selected');
  });
  const {cpid} = trSelected.dataset;
  if (document.querySelector(`#${cpid}`)) {
    document.querySelector(`#${cpid}`).classList.add('selected');
  }
};

/** Handle changes in threshold triggered by the sliders
 * in the control points table.
 * @param {HTMLElement} ob - the slider element
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const changeThreshold = (ev) => {
  ev.preventDefault();

  const el = ev.target;
  const {mv} = globals;
  const val = parseFloat(el.value);
  const tr = el.closest('tr');
  const data = tr.dataset.ijk;

  tr.querySelector("input[type=text]").value = val.toFixed(0);

  let i;
  for(i=globals.points.length-1; i>=0; i--) {
    if(data === globals.points[i][0]+','+globals.points[i][1]+','+globals.points[i][2]) {
      globals.values[i] = val;
      globals.prevValue = val;
    }
  }
  mv.draw();

  const cpel = document.querySelector(`div.cpoint[data-ijk="${data}"]`);
  if (cpel) {
    const cpid = cpel.id;
    selectControlPoint(cpid);
    selectThresholdSlider(cpid);
  }
};

// eslint-disable-next-line no-unused-vars
const inputThreshold = (ob) => {
  const {mv} = globals;
  const val = parseFloat(ob.value);
  const tr = ob.closest('tr');
  const data = tr.dataset.ijk;
  const cpid = document.querySelector(`div.cpoint[data-ijk="${data}"]`).id;

  tr.querySelector("input[type=range]").value = val.toFixed(0);

  let i;
  for(i=globals.points.length-1; i>=0; i--) {
    if(data === globals.points[i][0]+','+globals.points[i][1]+','+globals.points[i][2]) {
      globals.values[i] = val;
      globals.prevValue = val;
    }
  }
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
  const [i, j, k] = canvas2voxel(ev);

  globals.points[cpidIndex][0] = i;
  globals.points[cpidIndex][1] = j;
  globals.points[cpidIndex][2] = k;
  displayControlPointsTable();
  mv.draw();
};

const controlPointUpHandler = (ev) => {
  console.log("Up");
  const {mv} = globals;
  const cpid = ev.target.id;
  const match = cpid.match(/cp[\d]+/);

  switch(globals.selectedTool) {
  case 'Select':
    if (match === null) {
      return;
    }
    selectControlPoint(cpid);
    selectThresholdSlider(cpid);
    break;
  case 'Remove': {
    if (match === null) {
      return;
    }
    let i;
    const data = $('#'+cpid).data().ijk;
    for(i=globals.points.length-1; i>=0; i--) {
      if(data === globals.points[i][0]+','+globals.points[i][1]+','+globals.points[i][2]) {
        globals.points.splice(i, 1);
        globals.values.splice(i, 1);
      }
    }
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
  const {mv, interpolate} = globals;
  const [dim] = mv.mri;
  const data = new Float32Array(dim[0]*dim[1]*dim[2]);
  let val;
  let i, j, k;
  let ijk;
  for(i=0; i<dim[0]; i++) {
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        ijk = k*dim[1]*dim[0] + j*dim[0] + i;
        val = interpolate([i, j, k])*mv.maxValue/255;

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
    const [file] = input.files;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const str = ev.target.result;
      const ob = JSON.parse(str);
      globals.points = ob.points;
      globals.values = ob.values;
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

const render3D = () => {
  // puts a fresh version of the segmentation in localStorage
  thresholdWorker((data) => {
    document.querySelector("#progress").innerText = 'Done';
    setTimeout( () => {
      document.querySelector("#progress").innerText = "";
      document.querySelector("#progress").style.display = "none";
    }, 2000);

    const dim = new Uint16Array([...globals.mv.mri.dim, 0]);
    const blob = new Blob([dim, data]);
    localStorage.thresholdmann = URL.createObjectURL(blob);
    window.open('./render3D/index.html', 'Render 3D', 'width=800,height=600');
  });
};

const initKeyboardShortcuts = () => {
  document.addEventListener('keydown', (ev) => {
    const {key} = ev;
    switch(key) {
    case 's':
      globals.selectedTool = 'Select';
      document.querySelector('#tools').querySelector(".mui-pressed").classList.remove("mui-pressed");
      document.querySelector('#tools').querySelector(`[title="Select"`).classList.add("mui-pressed");
      break;
    case 'a':
      globals.selectedTool = 'Add';
      document.querySelector('#tools').querySelector(".mui-pressed").classList.remove("mui-pressed");
      document.querySelector('#tools').querySelector(`[title="Add"`).classList.add("mui-pressed");
      break;
    case 'r':
      globals.selectedTool = 'Remove';
      document.querySelector('#tools').querySelector(".mui-pressed").classList.remove("mui-pressed");
      document.querySelector('#tools').querySelector(`[title="Remove"`).classList.add("mui-pressed");
      break;
    case 'm':
      globals.selectedTool = 'Move';
      document.querySelector('#tools').querySelector(".mui-pressed").classList.remove("mui-pressed");
      document.querySelector('#tools').querySelector(`[title="Move"`).classList.add("mui-pressed");
      break;
    }
  });
};

const initUI = () => {
  const {mv} = globals;

  // Default control point
  globals.points = [
    [
      mv.mri.dim[0]/2|0,
      mv.mri.dim[1]/2|0,
      mv.mri.dim[2]/2|0
    ]
  ];
  globals.values = [127];
  globals.prevValue = 127;

  displayControlPointsTable();

  // Display volume info
  const {dim, pixdim} = mv.mri;
  document.querySelector("#info").innerHTML = `<b>Information</b><br />
  <b>file:</b> ${mv.mri.fileName}<br />
  <b>dim:</b> ${dim[0]} x ${dim[1]} x ${dim[2]}<br />
  <b>pixdim:</b> ${pixdim[0].toFixed(2)} x ${pixdim[1].toFixed(2)} x ${pixdim[2].toFixed(2)}<br />`;

  // Listen to control point clicks
  $('body').on('mouseup', controlPointUpHandler);
  $('body').on('mousedown', '.cpoint', controlPointDownHandler);
  $('body').on('mousemove', controlPointMoveHandler);

  // Listen to canvas clicks
  $('body').on('click', 'canvas', clickOnViewer);

  document.querySelector("#panels").style.display = "flex";
  $('#tools, #direction, #overlay, #saveMask, #saveControlPoints, #loadControlPoints').show();
  $('#upload-box').removeClass('init');

  globals.mv.draw = function draw() {
    globals.originalDraw();
    threshold();
    displayControlPoints();
  };

  mv.maxValue *= 1.1;
  mv.draw();

  // Initialise UI
  MUI.chose(document.querySelector('#tools'), (option) => {
    globals.selectedTool = option;
    switch(globals.selectedTool) {
    case "Add":
      break;
    case "Remove":
      break;
    }
  });
  MUI.chose(document.querySelector('#direction'), (option) => {
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
  MUI.chose(document.querySelector('#overlay'), (option) => {
    globals.selectedOverlay = option;
    globals.mv.draw();
  });
  MUI.push(document.querySelector('#render3D'), render3D);
  MUI.push(document.querySelector('#saveMask'), saveMask);
  MUI.push(document.querySelector('#saveControlPoints'), saveControlPoints);
  MUI.push(document.querySelector('#loadControlPoints'), loadControlPoints);

  _newPlaneSelectionUI();

  // init keyboard shortcuts
  initKeyboardShortcuts();
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
 * This function is called from
 * the HTML page.
 * @param {string} path - the path to the Nifti file
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const initWithPath = async (path) => {
  _newMRIViewer({path});
  await _display();
  initUI();
};

/** Adjust transparency of the thresholding mask. This
 * function is called from the HTML page.
 * @param {Event} ev - the event
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const changeAlpha = (ev) => {
  const newAlpha = Number(ev.target.value)/100;
  globals.alpha = newAlpha;
  globals.mv.draw();
};

/** Adjust the brightness of the brain MRI. This
 * function is called from the HTML page.
 * @param {Event} ev - the event
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const changeBrightness = (ev) => {
  const {brightness} = globals;
  const contrast = Number(ev.target.value)/100;
  globals.contrast = contrast;
  document.querySelector('canvas.viewer').style.filter = `brightness(${brightness}) contrast(${contrast})`;
};

/** Adjust the contrast of the brain MRI. This
 * function is called from the HTML page.
 * @param {Event} ev - the event
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
const changeContrast = (ev) => {
  const brightness = Number(ev.target.value)/100;
  const {contrast} = globals;
  globals.brightness = brightness;
  document.querySelector('canvas.viewer').style.filter = `brightness(${brightness}) contrast(${contrast})`;
};
