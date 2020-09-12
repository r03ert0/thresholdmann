/* global MUI, $ */
const globals = {
  mv: null,
  originalDraw: null,
  points: null,
  values: null,
  rbf: null,
  selectedTool: "Select",
  selectedOverlay: "Threshold Mask",
}
window.globals = globals;

function initRBF(points, values) {

  /*
  - linear: r
  - cubic: r**3
  - quintic: r**5
  - thin-plate: r**2 * log(r)
  - gaussian: exp(-(r/epsilon) ** 2)
  - multiquadric: sqrt((r/epsilon) ** 2 + 1)
  - inverse-multiquadric: 1 / sqrt((r/epsilon) ** 2 + 1)
  epsilon can be provided as a 4th parameter. Defaults to the average
  euclidean distance between points.
  */
  globals.rbf = RBF(points, values, 'linear' /*, epsilon */);
}

function displayControlPointsTable() {
  let i;
  const {points, values} = globals;

  // display control point table
  $('#control').html('<table></table>');
  $('#control table').html(`
<table>
<tr><th>I</th><th>J</th><th>K</th><th>Value</th></tr>
`);
  for(i=0; i<points.length; i++) {
    $('#control table').append(`
<tr>
  <td>${points[i][0]}</td>
  <td>${points[i][1]}</td>
  <td>${points[i][2]}</td>
  <td><input type="range" step='any' min=0 max=255 data-ijk="${points[i][0]},${points[i][1]},${points[i][2]}" value=${values[i]} oninput="changeThreshold(this)"/></td>
</tr>
`);
  }
}

function displayControlPoints() {
  const {mv, points} = globals;
  if(typeof points === 'undefined') {
    return;
  }

  let i;
  let slice, x, y;
  const plane = mv.views[0].plane;
  $('.cpoint').remove();

  const {W, H, D, Wdim, Hdim} = mv.dimensions.voxel[plane];
  for(i=0; i<points.length; i++) {
    const s = mv.IJK2S(points[i]);
    switch (plane) {
      case 'sag': [slice, x, y] = [s[0], s[1], H - 1 - s[2]]; break;
      case 'cor': [x, slice, y] = [s[0], s[1], H - 1 - s[2]]; break;
      case 'axi': [x, y, slice] = [s[0], H - 1 - s[1], s[2]]; break;
    }
    if(slice !== mv.views[0].slice) {
      continue;
    }
    x = 100*(0.5+x)/W;
    y = 100*(0.5+y)/H;
    $('#viewer .wrap').append(`<div class="cpoint" id="cp${i}" data-ijk="${points[i][0]},${points[i][1]},${points[i][2]}" style="left:${x}%;top:${y}%"></div>`);
  }
}

function thresholdJob() {
  const worker = new Worker("thresholdmann-worker.js");
  worker.onmessage = function(e) {
    var {msg} = e.data;
    switch(msg) {
      case 'success':
        console.log("Worker finished");
        var data = e.data.mask;
        saveNifti(data);
        $('#progress').text('Done');
        setTimeout( () => { $('#progress').text(''); }, 2000);
        break;
      case 'progress': {
        const v = e.data.value.split(',').map( (x) => parseInt(x) );
        $('#progress').text(`${v[0]} out of ${v[1]}`);
        break; }
      default:
        console.log("wrkr: "+e.data.msg);
    }
  };
  console.log("Start worker");
  worker.postMessage({
    cmd: "start",
    mri: globals.mv.mri.data,
    dim: globals.mv.mri.dim,
    maxValue: globals.mv.maxValue,
    points: globals.points,
    values: globals.values
  });
}

function threshold() {
  const {mv, rbf, selectedOverlay} = globals;
  if(typeof rbf === 'undefined') {
    return;
  }

  const c = mv.views[0].canvas;
  const ctx = c.getContext("2d");
  let slice, x, y;
  let i, j, k, s;
  let g, ind;
  const {width, height} = c;
  const plane = mv.views[0].plane;
  const {W, H, D, Wdim, Hdim} = mv.dimensions.voxel[plane];
  const px = ctx.getImageData(0, 0, width, height);
  slice = mv.views[0].slice;
  for(x=0; x<W; x++) {
    for(y=0; y<H; y++) {
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
      [i, j, k] = mv.S2IJK(s);
      ind = y*width + x;
      val = rbf([i, j, k]);
      g = px.data[4*ind+0];
      if(selectedOverlay === 'Threshold Mask') {
        px.data[4*ind+0] = (g>=val)?255:g;
        px.data[4*ind+1] = g;
        px.data[4*ind+2] = g;
      } else {
        px.data[4*ind+0] = val|0;
        px.data[4*ind+1] = val|0;
        px.data[4*ind+2] = val|0;
        px.data[4*ind+3] = 255;
      }
    }
  }
  ctx.putImageData(px, 0, 0);
}

function clickOnViewer(ev) {
  const {mv} = globals;
  const rect = $('canvas.viewer')[0].getBoundingClientRect();
  const x = mv.views[0].canvas.width * (ev.clientX - rect.left)/rect.width|0;
  const y = mv.views[0].canvas.height * (ev.clientY - rect.top)/rect.height|0;
  const slice = mv.views[0].slice;
  let i, j, k, s;
  const plane = mv.views[0].plane;

  const {W, H, D, Wdim, Hdim} = mv.dimensions.voxel[plane];

  switch (plane) {
    case 'sag': s = [slice, x, H - 1 - y]; break;
    case 'cor': s = [x, slice, H - 1 - y]; break;
    case 'axi': s = [x, H - 1 - y, slice]; break;
  }
  [i, j, k] = mv.S2IJK(s);

  switch(selectedTool) {
    case 'Select':
      console.log([i, j, k], rbf([i, j, k]));
      break;
    case 'Add':
      points.push([i, j, k]);
      values.push(127);
      initRBF(points, values);
      displayControlPointsTable();
      mv.draw();
      break;
  }
}

function changeThreshold(ob) {
  const {mv, points, values} = globals;
  const val = parseFloat(ob.value);
  const data = $(ob).data().ijk;
  const cpid = $(`[data-ijk="${data}"]`).attr('id');

  let i;
  for(i=points.length-1; i>=0; i--) {
    if(data === points[i][0]+','+points[i][1]+','+points[i][2]) {
      values[i] = val;
    }
  }
  initRBF(points, values);
  mv.draw();
  selectControlPoint(cpid);
  selectThresholdSlider(cpid);
}

function selectControlPoint(cpid) {
  $('.cpoint.selected').removeClass('selected');
  $('#'+cpid).addClass('selected');
}
function selectThresholdSlider(cpid) {
  const data = $('#'+cpid).data().ijk;
  $('tr.selected').removeClass('selected');
  $(`#control tr input[data-ijk="${data}"]`).closest('tr')
    .addClass('selected');
}

function controlPointMoveHandler(ev) {
  const cpid = ev.target.id;
  if($('#'+cpid).hasClass('selected') === false) {

    return;
  }
}

function controlPointUpHandler(ev) {
  const {mv} = globals;
  const cpid = ev.target.id;

  switch(selectedTool) {
    case 'Select':
      selectControlPoint(cpid);
      selectThresholdSlider(cpid);
      break;
    case 'Remove': {
      let i;
      const data = $('#'+cpid).data().ijk;
      for(i=points.length-1; i>=0; i--) {
        if(data === points[i][0]+','+points[i][1]+','+points[i][2]) {
          points.splice(i, 1);
          values.splice(i, 1);
        }
      }
      initRBF(points, values);
      displayControlPointsTable();
      mv.draw();
      break;
    }
  }
}

function controlPointDownHandler(ev) {
}

function saveMask() {
  thresholdJob();
}
function saveMask_old() {
  const {mv} = globals;
  const [dim] = mv.mri;
  let data = new Float32Array(dim[0]*dim[1]*dim[2]);
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
}

function loadNifti() {
  var input = document.createElement("input");
  input.type = "file";
  input.onchange = function(e) {
    var [file] = this.files;
    console.log('loading', file);
    init(file);
  };
  input.click();
}

function saveNifti(data) {
  const {mv} = globals;
  let niigz = mv.mri.createNifti(mv.mri.dim, mv.mri.pixdim, mv.mri.vox2mm(), data);
  let name = prompt("Save mask as...", "mask.nii.gz");
  if(name !== null) {
    mv.mri.saveNifti(niigz, name);
  }
}
function saveControlPoints() {
  var a = document.createElement('a');
  const ob = {
    points: points,
    values: values
  };
  a.href = 'data:application/json;charset=utf-8,' + JSON.stringify(ob);
  let name = prompt("Save Control Points As...", "control-points.json");
  if(name !== null) {
    a.download = name;
    document.body.appendChild(a);
    a.click();
  }
}

function loadControlPoints() {
  const {mv} = globals;
  var input = document.createElement("input");
  input.type = "file";
  input.onchange = function(e) {
    var [file] = this.files;
    var reader = new FileReader();
    reader.onload = function(e) {
      let str = e.target.result;
      const ob = JSON.parse(str);
      points = ob.points;
      values = ob.values;
      initRBF(points, values);
      displayControlPointsTable();
      mv.draw();
    };
    reader.readAsText(file);
  };
  input.click();
}

function _newMRIViewer({file, path}) {
  globals.mv = new MRIViewer({
    mriFile: file,
    mriPath: path,
    space: 'voxel',
    views: [
      {
        elem: $('#viewer').get(0),
        width: 800,
        plane: 'sag',
        addPlaneSelect: true,
        addSpaceSelect: false
      }
    ]
  });
  globals.originalDraw = globals.mv.draw;
}

async function _display() {
  try {
    await globals.mv.display();
  } catch(err) {
    throw new Error(err);
  }
}

function initUI() {
  const {mv} = globals;
  // Default control Points
  globals.points = [[mv.mri.dim[0]/2|0, mv.mri.dim[1]/2|0, mv.mri.dim[2]/2|0]];
  globals.values = [127];
  initRBF(globals.points, globals.values);
  displayControlPointsTable();

  globals.mv.draw = function draw() {
    globals.originalDraw();
    threshold();
    displayControlPoints();
  };

  mv.maxValue *= 1.1;
  mv.draw();

  // Listen to control point clicks
  $('body').on('mouseup', '.cpoint', controlPointUpHandler);
  $('body').on('mousedown', '.cpoint', controlPointDownHandler);
  $('body').on('mousemove', '.cpoint', controlPointMoveHandler);

  // Listen to canvas clicks
  $('body').on('click', 'canvas', clickOnViewer);

  $('#tools, #overlay, #saveMask, #saveControlPoints, #loadControlPoints').show();
  $('#buttons').removeClass('init');

  // Initialise UI
  MUI.push($('#loadNifti'), loadNifti);
  MUI.chose($('#tools'), function(option) {
    globals.selectedTool = option;
    switch(globals.selectedTool) {
      case "Add":
        break;
      case "Remove":
        break;
    }
  });
  MUI.chose($('#overlay'), function(option) {
    globals.selectedOverlay = option;
    globals.mv.draw();
  });
  MUI.push($('#saveMask'), saveMask);
  MUI.push($('#saveControlPoints'), saveControlPoints);
  MUI.push($('#loadControlPoints'), loadControlPoints);
}

async function initWithPath(path) {
  _newMRIViewer({path});
  await _display();
  initUI();
}

async function init(file) {
  _newMRIViewer({file});
  await _display();
  initUI();
}
