self.addEventListener('message', function(e) {
  var data = e.data;
  switch (data.cmd) {
    case 'start':
      var params= {
        mri: data.mri,
        dim: data.dim,
        maxValue: data.maxValue,
        points: data.points,
        values: data.values
      };
      runThreshold(params);
      break;
  }
});

var rbf;

function runThreshold(params) {
  self.postMessage({msg: "thresholding..."});
  importScripts('/rbf/node_modules/numeric/numeric-1.2.6.min.js');
  importScripts('/rbf/index.js');
  const {points, values} = params;
  rbf = RBF(points, values, 'linear' /*, epsilon */);
  const mask = thresholdMRI(params);
  self.postMessage({msg: "success", mask: mask}, [mask.buffer]);
}

function thresholdMRI(params) {
  const {mri, dim, maxValue} = params;
  let data = new Float32Array(dim[0]*dim[1]*dim[2]);
  let val;
  let i, j, k;
  let ijk;
  for(i=0; i<dim[0]; i++) {
    self.postMessage({msg: 'progress', value: `${i},${dim[0]}`});
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        ijk = k*dim[1]*dim[0] + j*dim[0] + i;
        val = rbf([i, j, k])*maxValue/255;

        if(mri[ijk] <= val) {
          data[ijk] = 0;
        } else {
          data[ijk] = 1;
        }
      }
    }
  }

  return data;
}
