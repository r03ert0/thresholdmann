const interpolation = (pos, points, values) => {
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

const thresholdMRI = (params) => {
  const { mri, dim, maxValue, points, values, directionUp } = params;
  const data = new Float32Array(dim[0]*dim[1]*dim[2]);
  let val;
  let i, j, k;
  let ijk;
  for(i=0; i<dim[0]; i++) {
    self.postMessage({msg: 'progress', value: `${i},${dim[0]}`});
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        ijk = k*dim[1]*dim[0] + j*dim[0] + i;
        val = interpolation([i, j, k], points, values)*maxValue/255;

        if (directionUp) {
          data[ijk] = (mri[ijk] <= val)?0:1;
        } else {
          data[ijk] = (mri[ijk] >= val)?0:1;
        }
      }
    }
  }

  return data;
};

const runThreshold = (params) => {
  self.postMessage({msg: "thresholding..."});
  // importScripts('rbf/node_modules/numeric/numeric-1.2.6.min.js');
  // importScripts('rbf/index.js');
  const mask = thresholdMRI(params);
  self.postMessage({msg: "success", mask: mask}, [mask.buffer]);
};

self.addEventListener('message', function(e) {
  const {data} = e;
  switch (data.cmd) {
  case 'start': {
    const params= {
      mri: data.mri,
      dim: data.dim,
      maxValue: data.maxValue,
      points: data.points,
      values: data.values,
      directionUp: data.directionUp
    };
    runThreshold(params);
    break;
  }
  }
});
