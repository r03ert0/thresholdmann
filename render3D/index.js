/* global THREE */

var camera, renderer, scene, trackball;
var dot = 0; // dot for "wait" animation

const onWindowResize = () => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  renderer.setSize( W, H );
  camera.aspect = W/H;
  camera.updateProjectionMatrix();
};

// eslint-disable-next-line max-statements
const createMesh = (vertices, faces) => {
  console.log("creating mesh");
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setClearColor(0x000000);
  const {innerWidth: W, innerHeight: H} = window;
  renderer.setSize(W, H);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(50, W/H, 1, 2000 );
  camera.position.z = 200;
  scene = new THREE.Scene();

  trackball = new THREE.TrackballControls(camera, renderer.domElement);

  window.addEventListener( 'resize', onWindowResize, false );

  const geometry = new THREE.BufferGeometry();
  const verts = new Float32Array(vertices.flat());
  geometry.setAttribute( 'position', new THREE.BufferAttribute( verts, 3 ) );
  geometry.setIndex(faces.flat());
  geometry.center();

  geometry.computeFaceNormals();
  geometry.computeVertexNormals();
  const material = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  console.log("mesh done.");
};

const render = () => {
  renderer.render( scene, camera );
  trackball.update();
};

const animate = () => {
  requestAnimationFrame( animate );
  render();
};

const startWaitingAnimation = () => {
  setInterval(function() {
    if(document.querySelector("#dot")) {
      document.querySelector("#dot").style.marginLeft = `${50*(1+Math.sin(dot))}%`;
      dot += 0.1;
    }
  }, 33);
};

const startRender3D = () => {
  const pr = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', localStorage.thresholdmann, true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      var blob = this.response;
      var reader = new FileReader();
      reader.addEventListener("loadend", function() {
        const data = reader.result;
        const dv = new DataView(data);
        const dim = [
          dv.getInt16(0, true),
          dv.getInt16(2, true),
          dv.getInt16(4, true),
          dv.getInt16(6, true)
        ];
        const sz = dim[0]*dim[1]*dim[2];
        const mask = new Float32Array(data, 8, sz);

        const worker = new Worker("surfacenets.worker.js");
        worker.onmessage = (e) => {
          const [vertices, faces] = e.data;
          createMesh(vertices, faces);
          document.querySelector("#splash").remove();
          animate();
          resolve();
        };
        worker.postMessage({dim, mask});
      });
      reader.readAsArrayBuffer(blob);
    };
    xhr.onerror = function(e) {
      console.log("load from localStorage failed. Try to load from server");
      reject(e);
    };
    xhr.send();
  });

  return pr;
};

const init = () => {
  startWaitingAnimation();
  startRender3D();
};

init();
