var mv;
var originalDraw;
var points;
var values;
var rbf;
var selectedTool = "Select";
var selectedOverlay = "Threshold Mask";

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
    rbf = RBF(points, values, 'linear' /*, epsilon */);
}

function displayControlPointsTable() {
    let i;

    // display control point table
    $('#control').html('<table></table>');
    $('#control table').html(`
<table>
<tr><th>I</th><th>J</th><th>K</th><th>Value</th></tr>
`);
    for(i=0;i<points.length;i++) {
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
    if(typeof points === 'undefined') {
        return;
    }

    let i;
    let s, c, a;
    let width, height;
    let x, y, z;
    $('.cpoint').remove();
    for(i=0;i<points.length;i++) {
        switch(mv.views[0].plane) {
            case 'sag':
                [x, y, z] = [points[i][1], points[i][2], points[i][0]];
                [width, height] = [mv.mri.dim[1], mv.mri.dim[2]];
                break;
            case 'cor':
                [x, y, z] = [points[i][0], points[i][2], points[i][1]];
                [width, height] = [mv.mri.dim[0], mv.mri.dim[2]];
                break;
            case 'axi':
                [x, y, z] = [points[i][0], points[i][1], points[i][2]];
                [width, height] = [mv.mri.dim[0], mv.mri.dim[1]];
                break;
        }
        if(z!=mv.views[0].slice) {
            continue;
        }
        x=100*(0.5+x)/width;
        y=100*(0.5+y)/height;
        $('#viewer .wrap').append(`<div class="cpoint" id="cp${i}" data-ijk="${points[i][0]},${points[i][1]},${points[i][2]}" style="left:${x}%;top:${y}%"></div>`);
    }
}

function changeThreshold(ob) {
    const val = parseFloat(ob.value);
    const data = $(ob).data().ijk;
    const cpid = $(`[data-ijk="${data}"]`).attr('id');

    for(i=points.length-1;i>=0;i--) {
        if(data === points[i][0]+','+points[i][1]+','+points[i][2]) {
            values[i] = val;
        }
    }
    initRBF(points, values);
    mv.draw();
    selectControlPoint(cpid);
    selectThresholdSlider(cpid);
}

function threshold() {
    if(typeof rbf === 'undefined') {
        return;
    }

    let val = parseFloat($('#threshold').val());
    const c = mv.views[0].canvas;
    const ctx = c.getContext("2d");
    let x, y, z;
    let i, j, k;
    let ind, g;
    const {width, height} = c;
    const px = ctx.getImageData(0,0,width,height);
    z=mv.views[0].slice;
    for(x=0;x<width;x++) {
        for(y=0;y<height;y++) {
            switch(mv.views[0].plane) {
                case 'sag':
                    [i, j, k] = [z, x*mv.mri.dim[1]/width|0, y*mv.mri.dim[2]/height|0];
                    break;
                case 'cor':
                    [i, j, k] = [x*mv.mri.dim[0]/width|0, z, y*mv.mri.dim[2]/height|0];
                    break;
                case 'axi':
                    [i, j, k] = [x*mv.mri.dim[0]/width|0, y*mv.mri.dim[1]/height|0, z];
                    break;
            }
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

function selectControlPoint(cpid) {
    $('.cpoint.selected').removeClass('selected');
    $('#'+cpid).addClass('selected');
}
function selectThresholdSlider(cpid) {
    const data = $('#'+cpid).data().ijk;
    $('tr.selected').removeClass('selected');
    $(`#control tr input[data-ijk="${data}"]`).closest('tr').addClass('selected');
}

function controlPointMoveHandler(ev) {
    const cpid = ev.target.id;
    if($('#'+cpid).hasClass('selected') === false) {
        return;
    }
/*
    const data = $('#'+cpid).data().ijk;
    const rect = $('canvas.viewer')[0].getBoundingClientRect();
    const x = mv.views[0].canvas.width * (ev.clientX - rect.left)/rect.width|0;
    const y = mv.views[0].canvas.height * (ev.clientY - rect.top)/rect.height|0;
    const z = mv.views[0].slice;
    const [i, j, k] = [z, x, y];

    points.push([i,j,k]);
    values.push(127);
    initRBF(points, values);
    displayControlPointsTable();
    mv.draw();
*/
}

function controlPointUpHandler(ev) {
    const cpid = ev.target.id;

    switch(selectedTool) {
        case 'Select':
            selectControlPoint(cpid);
            selectThresholdSlider(cpid);
            break;
        case 'Remove':
            let i;
            const data = $('#'+cpid).data().ijk;
            for(i=points.length-1;i>=0;i--) {
                if(data === points[i][0]+','+points[i][1]+','+points[i][2]) {
                    points.splice(i,1);
                    values.splice(i,1);
                }
            }
            initRBF(points, values);
            displayControlPointsTable();
            mv.draw();
            break;
    }
}

function controlPointDownHandler(ev) {
}

function addControlPoint() {
    $('.cpoint.selected').removeClass('selected');
    $('#'+ev.target.id).addClass('selected');
}
function clickOnViewer(ev) {
    const rect = $('canvas.viewer')[0].getBoundingClientRect();
    const x = mv.views[0].canvas.width * (ev.clientX - rect.left)/rect.width|0;
    const y = mv.views[0].canvas.height * (ev.clientY - rect.top)/rect.height|0;
    const z = mv.views[0].slice;
    let i, j, k;

    switch(mv.views[0].plane) {
        case 'sag':
            [i, j, k] = [z, x, y];
            break;
        case 'cor':
            [i, j, k] = [x, z, y];
            break;
        case 'axi':
            [i, j, k] = [x, y, z];
            break;
    }

    switch(selectedTool) {
        case 'Select':
            console.log(rbf([i, j, k]));
            break;
        case 'Add':
            points.push([i,j,k]);
            values.push(127);
            initRBF(points, values);
            displayControlPointsTable();
            mv.draw();
            break;
    }
}

function saveMask() {
    const pixdim = mv.dimensions.absolute.pixdim;
    const dim = mv.mri.dim;
    let data = new Float32Array(dim[0]*dim[1]*dim[2]);
    let val;
    let x, y, z;
    let i, s, w;
    let ijk;
    let n = 0;
    for(i=0;i<dim[0];i++) {
        for(j=0;j<dim[1];j++) {
            for(k=0;k<dim[2];k++) {
                ijk = k*dim[1]*dim[0] + j*dim[0] + i;
                val = rbf([i, j, k])*mv.maxValue/255;
                
                if(mv.mri.data[ ijk ] <= val) {
                    data[ ijk ] = 0;
                } else {
                    data[ ijk ] = 1;
                }
            }
        }
    }
    let niigz = mv.mri.createNifti(mv.mri.dim, mv.mri.pixdim, mv.mri.vox2mm(), data);
    let name = prompt("Save mask as...", "mask.nii.gz");
    if(name !== null) {
        mv.mri.saveNifti(niigz, name);
    }
}

function init(file) {
    /*
        MRI Viewer
    */
    mv=new MRIViewer({
//        mriPath: 'galago.nii.gz',
        mriFile: file,
        space: 'voxel',
        views: [{
            elem: $('#viewer').get(0),
            plane: 'sag',
            addPlaneSelect: true,
            addSpaceSelect: true
        }]
    });
    originalDraw = mv.draw;
    mv.draw = function draw() {
        originalDraw();
        threshold();
        displayControlPoints();
    }
    mv.display()
    .then( (o) => {
        // Default control Points
        points = [[104, 66, 82]];
        values = [127];
        initRBF(points, values);
        displayControlPointsTable();

        // Listen to control point clicks
        $('body').on('mouseup', '.cpoint', controlPointUpHandler);
        $('body').on('mousedown', '.cpoint', controlPointDownHandler);
        $('body').on('mousemove', '.cpoint', controlPointMoveHandler);

        // Listen to canvas clicks
        $('body').on('click', 'canvas', clickOnViewer);

        // Initialise UI
        MUI.chose($('#tools'), function(option) {
            selectedTool = option;
            switch(selectedTool) {
                case "Add":
                    break;
                case "Remove":
                    break;
            }
        });
        MUI.chose($('#overlay'), function(option) {
            selectedOverlay = option;
            mv.draw();
        });
        MUI.push($('#saveMask'), saveMask);
        MUI.push($('#saveControlPoints'), saveControlPoints);

        $('#tools, #overlay, #saveMask, #saveControlPoints').show();
        $('#content').removeClass('init');

        mv.maxValue *= 1.1;
        mv.draw();
    })
    .catch((err) => {
        console.log(err);
    });
}
