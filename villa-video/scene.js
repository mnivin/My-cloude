import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FPS = 30, DURATION = 50;
const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const SCALE = parseFloat(params.get('scale') || '1');
const Q = k => params.has(k) ? parseFloat(params.get(k)) : null;

// ---------- helpers ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry(1234);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
function fbm(x, y) { let a = 0.5, s = 0; for (let i = 0; i < 5; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }

function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ---------- renderer ----------
const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
stage.style.transform = `scale(${SCALE})`;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc9a58c, 0.00085);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.5, 30000);

// ---------- textures ----------
const sandTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const r = mulberry(5); const id = g.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) { const v = 205 + r() * 50; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; }
  g.putImageData(id, 0, 0);
});
const rippleTex = canvasTex(512, 512, (g, w, h) => {
  const id = g.getImageData(0, 0, w, h); const P2 = Math.PI * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w * P2, v = y / h * P2; const wob = Math.sin(u * 2 + Math.sin(v * 3) * 0.8) * 1.3 + Math.sin(u * 5 + v * 2) * 0.5;
    const r = 0.5 + 0.5 * Math.sin(v * 14 + wob * 2.2); const gr = hash2(x, y) * 0.25;
    const c = 255 * clamp(0.25 + 0.6 * r * r + gr, 0, 1); const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = c; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
});
const woodTex = canvasTex(512, 512, (g, w, h) => {
  const r = mulberry(8); const n = 8, ph = h / n;
  for (let i = 0; i < n; i++) {
    const b = 0.78 + r() * 0.25; g.fillStyle = `rgb(${150 * b | 0},${104 * b | 0},${66 * b | 0})`; g.fillRect(0, i * ph, w, ph);
    g.globalAlpha = 0.12; g.strokeStyle = '#3a2412';
    for (let k = 0; k < 14; k++) { const y = i * ph + r() * ph; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - .5) * 6); g.lineWidth = 1; g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = '#2a1a0e'; g.fillRect(0, i * ph, w, 3);
    const jx = r() * w; g.fillRect(jx, i * ph, 3, ph);
  }
});
const slatTex = canvasTex(256, 256, (g, w, h) => {
  const r = mulberry(11); const n = 8, pw = w / n;
  for (let i = 0; i < n; i++) { const b = 0.75 + r() * 0.3; g.fillStyle = `rgb(${138 * b | 0},${92 * b | 0},${56 * b | 0})`; g.fillRect(i * pw, 0, pw, h); g.fillStyle = '#1c120a'; g.fillRect(i * pw, 0, 7, h); }
});
const tileTex = canvasTex(512, 512, (g, w, h) => {
  const r = mulberry(21); g.fillStyle = '#e6dccb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const b = 222 + r() * 22; g.fillStyle = `rgb(${b | 0},${b - 9 | 0},${b - 26 | 0})`; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124); }
  g.globalAlpha = 0.06; for (let i = 0; i < 300; i++) { g.fillStyle = r() > .5 ? '#fff' : '#7a6a50'; g.fillRect(r() * w, r() * h, 20 + r() * 60, 1 + r() * 2); }
});
const stoneTex = canvasTex(512, 512, (g, w, h) => {
  const r = mulberry(31); g.fillStyle = '#5f574c'; g.fillRect(0, 0, w, h);
  const rows = 10, rh = h / rows;
  for (let j = 0; j < rows; j++) { let x = -r() * 60; while (x < w) { const bw = 50 + r() * 90; const b = 0.75 + r() * 0.4; g.fillStyle = `rgb(${188 * b | 0},${172 * b | 0},${148 * b | 0})`; g.fillRect(x + 2, j * rh + 2, bw - 4, rh - 4); x += bw; } }
});
const poolTileTex = canvasTex(256, 256, (g, w, h) => {
  const r = mulberry(41); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const b = 0.85 + r() * 0.15; g.fillStyle = `rgb(${120 * b | 0},${222 * b | 0},${232 * b | 0})`; g.fillRect(i * 32, j * 32, 31, 31); }
});
const artTex = canvasTex(512, 256, (g, w, h) => {
  const r = mulberry(77); g.fillStyle = '#efe6d6'; g.fillRect(0, 0, w, h);
  const cols = ['#c9532e', '#1d4e63', '#e0a53c', '#27332f', '#d9c2a0'];
  for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 5]; g.globalAlpha = 0.9; g.beginPath(); g.arc(r() * w, r() * h, 30 + r() * 90, 0, 7); g.fill(); }
}, false);
const frondTex = canvasTex(512, 2048, (g, w, h) => {
  g.clearRect(0, 0, w, h); const r = mulberry(51); g.lineCap = 'round';
  for (let i = 0; i < 74; i++) {
    const t = 0.05 + 0.94 * i / 74, y = h * (1 - t);
    const len = (w * 0.5) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.12)), 0.55) * (0.8 + r() * 0.2);
    for (const s of [-1, 1]) {
      const gc = 40 + r() * 38; g.strokeStyle = `rgb(${gc * 0.72 | 0},${gc + 30 | 0},${gc * 0.36 | 0})`; g.lineWidth = 9 + r() * 3;
      const droop = (r() - 0.3) * 30;
      g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * len * 0.6, y - len * 0.5, w / 2 + s * len, y - len * 0.62 + droop); g.stroke();
    }
  }
  g.strokeStyle = '#6f7a3a'; g.lineWidth = 12; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 10); g.stroke();
}, false);
const trunkTex = canvasTex(64, 512, (g, w, h) => {
  const r = mulberry(61); for (let i = 0; i < 40; i++) { const b = 0.7 + r() * 0.4; g.fillStyle = `rgb(${128 * b | 0},${108 * b | 0},${86 * b | 0})`; g.fillRect(0, i * h / 40, w, h / 40); g.fillStyle = 'rgba(40,28,18,0.55)'; g.fillRect(0, i * h / 40, w, 3); }
});
const waterNormals = new THREE.TextureLoader().load('waternormals.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
const poolNormals = waterNormals.clone(); poolNormals.wrapS = poolNormals.wrapT = THREE.RepeatWrapping; poolNormals.repeat.set(3, 1.4);

// ---------- sky ----------
const sunDir = new THREE.Vector3();
const cloudMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: sunDir }, time: { value: 0 }, dayF: { value: 1 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    varying vec3 vDir; uniform vec3 sunDir; uniform float time; uniform float dayF;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.02+vec2(3.1,1.7); a*=0.5; } return s; }
    float fbm3(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*n(p); p=p*2.02+vec2(3.1,1.7); a*=0.5; } return s*1.12; }
    void main(){
      vec3 d = normalize(vDir); float y = max(d.y, 0.0);
      float az = dot(normalize(d.xz+1e-5), normalize(sunDir.xz))*0.5+0.5; float a2 = az*az;
      vec3 zen = mix(vec3(0.035,0.055,0.17), vec3(0.11,0.23,0.52), dayF);
      vec3 midc = mix(mix(vec3(0.26,0.20,0.40), vec3(0.42,0.44,0.66), dayF), mix(vec3(0.95,0.42,0.26), vec3(1.0,0.68,0.38), dayF), a2);
      vec3 hor = mix(mix(vec3(0.50,0.27,0.40), vec3(0.95,0.60,0.56), dayF), mix(vec3(1.3,0.40,0.09), vec3(1.5,0.74,0.24), dayF), a2);
      vec3 c = mix(hor, midc, smoothstep(0.0, 0.17, y));
      c = mix(c, zen, smoothstep(0.07, 0.62, y));
      float sd = max(dot(d, sunDir), 0.0);
      c += vec3(1.0,0.48,0.16)*pow(sd, 6.0)*0.75*(0.45+0.55*dayF);
      c += vec3(1.0,0.72,0.38)*pow(sd, 90.0)*1.5;
      float disk = smoothstep(0.99962,0.99985,sd)*16.0;
      // clouds
      vec2 uv = d.xz/(y+0.14)*1.25 + vec2(time*0.005, 0.0);
      float w = fbm3(uv*0.6+4.0);
      float f = fbm(uv*vec2(1.0,2.6) + w*1.6);
      float cl = smoothstep(0.47, 0.78, f) * smoothstep(0.012, 0.2, d.y) * 0.92;
      float thick = smoothstep(0.55, 0.92, f);
      float glow = pow(sd, 2.0);
      vec3 lit = mix(mix(vec3(0.85,0.42,0.46), vec3(1.0,0.62,0.55), dayF), vec3(1.7,0.72,0.26), glow);
      vec3 shade = mix(vec3(0.16,0.13,0.25), vec3(0.34,0.30,0.42), dayF);
      vec3 cc = mix(lit, shade, thick*0.75) * (0.75 + 0.5*pow(1.0-y, 4.0));
      c = mix(c + vec3(1.0,0.85,0.6)*disk*(1.0-cl), cc, cl);
      if (d.y < 0.0) c = hor*mix(0.55, 0.3, smoothstep(0.0,-0.3,d.y));
      gl_FragColor = vec4(c, 1.0);
    }`
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), cloudMat);
clouds.renderOrder = -1; clouds.frustumCulled = false; scene.add(clouds);

// ---------- lights ----------
const sun = new THREE.DirectionalLight(0xffc38a, 3.5);
sun.castShadow = true; sun.shadow.mapSize.set(Q('sh') ?? 3072, Q('sh') ?? 3072);
const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 900;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x6b5a48, 0.55); scene.add(hemi);

// ---------- terrain ----------
const G = 3.2;
const shoreZ = x => 62 + 5 * Math.sin(x * 0.011) + 3 * Math.sin(x * 0.027 + 1.3);
function padMask(x, z) { return (1 - smooth(34, 46, Math.abs(x))) * smooth(-74, -60, z) * (1 - smooth(24.5, 28, z)); }
function height(x, z) {
  const s = shoreZ(x) - z; let h;
  if (s < 0) h = Math.max(s * 0.07, -6);
  else {
    h = 2.5 * smooth(0, 34, s);
    h += smooth(40, 120, s) * (1.5 + 6 * fbm(x * 0.012, z * 0.012));
    h += smooth(160, 1000, s) * (20 + 110 * fbm(x * 0.0022 + 7, z * 0.0022 + 3));
    h = lerp(h, 3.0, padMask(x, z));
  }
  return h;
}
{
  const nx = 280, nz = 230, pos = [], col = [], uv = [], idx = [];
  const cSand = new THREE.Color(0xe6cfa2), cWet = new THREE.Color(0x8f7c5e), cVeg = new THREE.Color(0x77793f), cHill = new THREE.Color(0x6b6a42), cLawn = new THREE.Color(0x5f8a38), c = new THREE.Color();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx * 2 - 1, v = j / nz * 2 - 1;
    const x = 4500 * (0.045 * u + 0.955 * u * u * u);
    const z = v > 0 ? 20 + 130 * v : 20 + 1500 * (0.075 * v + 0.925 * v * v * v);
    const y = height(x, z), s = shoreZ(x) - z;
    pos.push(x, y, z); uv.push(x / 7, z / 7);
    c.copy(cSand);
    c.lerp(cWet, 1 - smooth(1, 8, s));
    const veg = smooth(42, 110, s) * smooth(0.38, 0.6, fbm(x * 0.035 + 2, z * 0.035));
    c.lerp(cVeg, veg * 0.9); c.lerp(cHill, smooth(150, 600, s));
    const pm = padMask(x, z); if (pm > 0.5 && z < 24.2) c.lerp(cLawn, smooth(0.5, 0.9, pm));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, bumpMap: rippleTex, bumpScale: 0.3, roughness: 0.95 }));
  m.receiveShadow = true; scene.add(m);
}

// ---------- ocean ----------
const water = new Water(new THREE.PlaneGeometry(40000, 40000), {
  textureWidth: Q('wt') ?? 512, textureHeight: Q('wt') ?? 512, waterNormals, sunDirection: new THREE.Vector3(), sunColor: 0xffb070, waterColor: 0x06323c, distortionScale: 9, fog: false,
});
water.rotation.x = -Math.PI / 2; water.material.uniforms.size.value = 0.9; scene.add(water);

// shoreline overlay: shallow turquoise, swash, foam lines
const shoreMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { time: { value: 0 }, light: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: `varying vec3 wp; void main(){ wp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 wp; uniform float time; uniform vec3 light;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n(p); p=p*2.03+vec2(1.3,7.1); a*=0.5; } return s; }
    void main(){
      float x = wp.x, t = time;
      float s = (62.0 + 5.0*sin(x*0.011) + 3.0*sin(x*0.027+1.3)) - wp.z;
      float nn = fbm(vec2(x*0.03, t*0.12));
      float run = 2.6 + 2.4*sin(t*0.75 + x*0.012 + nn*4.0);
      float fn = fbm(vec2(x*0.7, s*0.7 + t*0.25));
      float inWater = smoothstep(run+0.15, run-0.25, s);
      float front = inWater * smoothstep(run-3.0, run-0.2, s);
      float w = sin(s*0.33 - t*1.15 + nn*5.0);
      float lines = smoothstep(0.72, 0.97, w) * smoothstep(-48.0,-6.0,s) * smoothstep(0.32,0.55, fbm(vec2(x*0.06, s*0.25 - t*0.25)));
      float foam = clamp(front*(0.55+0.6*fn) + lines*(0.5+0.7*fn), 0.0, 1.0);
      float shallow = smoothstep(-55.0, 0.0, s);
      vec3 turq = mix(vec3(0.05,0.42,0.45), vec3(0.42,0.80,0.72), shallow*shallow);
      float aW = inWater * (0.10 + 0.55*shallow);
      vec3 col = mix(turq*light, vec3(1.0)*light*1.05, foam);
      float a = max(aW, foam*0.95);
      float wet = (1.0-inWater) * (1.0 - smoothstep(4.5, 8.5, s)) * 0.38;
      col = mix(col, vec3(0.20,0.15,0.10)*light, step(a, 0.001));
      a = max(a, wet);
      a *= smoothstep(-58.0,-45.0,s);
      gl_FragColor = vec4(col, a);
    }`
});
{
  const nx = 520, nz = 76, pos = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = -1300 + 2600 * i / nx; const s = -60 + j; const z = shoreZ(x) - s; pos.push(x, Math.max(0, height(x, z)) + 0.05, z); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, shoreMat); m.renderOrder = 2; scene.add(m);
}

// ---------- materials ----------
const M = {
  stucco: new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.9 }),
  slab: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62 }),
  slat: new THREE.MeshStandardMaterial({ map: slatTex, roughness: 0.7 }),
  trav: new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.55 }),
  stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.45, metalness: 0.6 }),
  darkTile: new THREE.MeshStandardMaterial({ color: 0x1e3a44, roughness: 0.25 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xcfc3ae, roughness: 0.25 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xece5d8, roughness: 1 }),
  fabricD: new THREE.MeshStandardMaterial({ color: 0x6f7b80, roughness: 1 }),
  fabricT: new THREE.MeshStandardMaterial({ color: 0xc7653a, roughness: 1 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x2f5220, roughness: 1 }),
  gravel: new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 1 }),
  solar: new THREE.MeshStandardMaterial({ color: 0x0c1830, roughness: 0.15, metalness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.03, metalness: 0.85, transparent: true, opacity: 0.3, envMapIntensity: 1.3, depthWrite: false }),
  rail: new THREE.MeshStandardMaterial({ color: 0xcfe2e4, roughness: 0.03, metalness: 0.6, transparent: true, opacity: 0.16, depthWrite: false }),
  poolTile: new THREE.MeshStandardMaterial({ map: poolTileTex, roughness: 0.3, side: THREE.BackSide, emissive: 0x39c9d8, emissiveIntensity: 0.05 }),
  art: new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: artTex, emissiveIntensity: 0.15 }),
};
const glows = []; // [material, dayIntensity, nightIntensity]
function glowMat(color, day, night) { const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: day, roughness: 1 }); glows.push([m, day, night]); return m; }
const gCeil = glowMat(0xffcf9a, 0.9, 1.7), gLed = glowMat(0xffc27a, 1.5, 5), gLamp = glowMat(0xffd9a8, 2.5, 6), gFire = glowMat(0xff6a1c, 4, 9), gPoolL = glowMat(0x9ff4ff, 0.8, 5);
glows.push([M.poolTile, 0.05, 0.9], [M.art, 0.12, 0.55]);

function boxB(x0, x1, y0, y1, z0, z1, mat, o = {}) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0; const g = new THREE.BoxGeometry(w, h, d);
  if (mat.map && !o.nouv) { const t = o.tile || 4, uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / t, uv.getY(i) * dims[f][1] / t); } }
  const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = o.cast !== false && !mat.transparent; m.receiveShadow = o.recv !== false; if (mat.transparent) m.renderOrder = 3;
  (o.parent || scene).add(m); return m;
}

// ---------- villa ----------
// terrace
boxB(-30, 30, 1, G, 0, 9, M.trav);
boxB(-30, -8, 1, G, 9, 24.4, M.wood, { tile: 2.4 });
boxB(22, 30, 1, G, 9, 24.4, M.trav);
boxB(-8, 22, 1, 3.11, 22.6, 22.85, M.darkTile);
boxB(-8, 22, 1, 2.5, 22.85, 23.7, M.darkTile);
boxB(-8, 22, 0, 2.8, 23.7, 24.4, M.stone);
boxB(-30.2, -8, 0, 3.0, 24.4, 24.7, M.stone); boxB(22, 30.2, 0, 3.0, 24.4, 24.7, M.stone);
boxB(-30.3, -30, 0, G, 0, 24.4, M.stone); boxB(30, 30.3, 0, G, 0, 24.4, M.stone);
boxB(-7.98, 21.98, 1.5, 3.12, 9.02, 22.58, M.poolTile, { tile: 1.5, cast: false });
const poolMat = new THREE.MeshStandardMaterial({ color: 0x35c6d2, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.74, normalMap: poolNormals, normalScale: new THREE.Vector2(0.22, 0.22), emissive: 0x0c8fa6, emissiveIntensity: 0.1, envMapIntensity: 1.4 });
glows.push([poolMat, 0.08, 1.0]);
{ const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 13.6), poolMat); p.rotation.x = -Math.PI / 2; p.position.set(7, 3.13, 15.8); p.receiveShadow = true; p.renderOrder = 2; scene.add(p);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.85), poolMat); p2.rotation.x = -Math.PI / 2; p2.position.set(7, 2.52, 23.27); scene.add(p2); }
for (let i = 0; i < 9; i++) boxB(-6 + i * 3.25, -5.6 + i * 3.25, 2.3, 2.5, 9.03, 9.08, gPoolL, { cast: false });
// glass balustrade on the sea front
boxB(-30, -20.5, G, G + 1.1, 24.3, 24.34, M.rail); boxB(-15.5, -8, G, G + 1.1, 24.3, 24.34, M.rail); boxB(22, 30, G, G + 1.1, 24.3, 24.34, M.rail);
// side walls + hedges, back wall
boxB(-34.4, -34, 2, 4.9, -62, 24.6, M.stucco); boxB(34, 34.4, 2, 4.9, -62, 24.6, M.stucco); boxB(-34.4, 34.4, 2, 4.9, -62.4, -62, M.stucco);
boxB(-33.6, -32.2, 3, 4.6, -60, 22, M.hedge); boxB(32.2, 33.6, 3, 4.6, -60, 22, M.hedge);
// ground floor
boxB(-20, 18, G, G + 0.05, -24, 0, M.floor, { cast: false });
boxB(-20, 18, G, 6.9, -24, -23.6, M.stucco);
boxB(-20.4, -20, G, 6.9, -24, -10, M.stucco);
boxB(-20.4, -20, G, 6.9, -2, 0.6, M.stucco);
boxB(18, 18.7, G, 6.9, -24, 2.2, M.stone, { tile: 3 });
boxB(-20, 18, G, 6.9, -12.3, -12, M.wood, { tile: 3 });
boxB(-15, 18, G, 6.9, -0.06, 0, M.glass);
for (let k = 0; k <= 10; k++) boxB(-15 + k * 3.3 - 0.04, -15 + k * 3.3 + 0.04, G, 6.9, -0.1, 0.04, M.dark);
boxB(-15, 18, G, G + 0.08, -0.1, 0.04, M.dark);
// wood tower
boxB(-20.6, -15, G, 12.4, -10, -2, M.slat, { tile: 1.6 });
boxB(-20.8, -14.8, 12.4, 12.6, -10.2, -1.8, M.dark);
// mid slab + soffit + LED
boxB(-22, 26, 6.9, 7.25, -25, 5.5, M.slab);
boxB(-21.9, 25.9, 6.85, 6.9, 0.05, 5.4, M.wood, { tile: 2.4, cast: false });
boxB(18.75, 25.9, 6.85, 6.9, -24.9, 0.05, M.wood, { tile: 2.4, cast: false });
boxB(-21.5, 25.5, 6.82, 6.85, 5.0, 5.08, gLed, { cast: false });
boxB(-15, 18, 6.83, 6.86, -12, -0.2, gCeil, { cast: false });
boxB(25, 25.2, G, 6.9, 4.4, 4.6, M.dark); boxB(25, 25.2, G, 6.9, -20, -19.8, M.dark);
// upper floor
boxB(-14, 24, 7.25, 7.3, -22, 3.5, M.floor, { cast: false });
boxB(-14, 24, 7.25, 10.7, -22, -21.6, M.stucco);
boxB(-14, -13.6, 7.25, 10.7, -22, 3.5, M.stucco);
boxB(23.6, 24, 7.25, 10.7, -22, -3, M.stucco); boxB(23.6, 23.66, 7.25, 10.7, -3, 3.5, M.glass);
boxB(-13.6, 23.6, 7.25, 10.7, -8.3, -8, M.stucco);
boxB(-13.6, 23.6, 7.25, 10.7, 3.44, 3.5, M.glass);
for (let k = 0; k <= 12; k++) boxB(-13.6 + k * 3.1 - 0.04, -13.6 + k * 3.1 + 0.04, 7.25, 10.7, 3.4, 3.54, M.dark);
boxB(-22, 26, 7.25, 8.35, 5.4, 5.44, M.rail); boxB(25.92, 25.96, 7.25, 8.35, -25, 5.4, M.rail); boxB(-21.96, -21.92, 7.25, 8.35, -25, 5.4, M.rail);
boxB(-13.6, 23.6, 10.63, 10.66, -8, 3.4, gCeil, { cast: false });
// roof
boxB(-16, 26.5, 10.7, 11.05, -23.5, 6.2, M.slab);
boxB(-15.9, 26.4, 10.65, 10.7, 3.55, 6.1, M.wood, { tile: 2.4, cast: false });
boxB(-15.5, 26, 10.62, 10.65, 5.7, 5.78, gLed, { cast: false });
boxB(-15.4, 25.9, 11.05, 11.1, -23, 5.6, M.gravel);
for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) { const m = boxB(-12 + k * 3.6, -9 + k * 3.6, 11.3, 11.36, -20 + r * 4.4, -17.6 + r * 4.4, M.solar); m.rotation.x = -0.22; }
for (let k = 0; k < 3; k++) boxB(-6 + k * 9, -3 + k * 9, 11.1, 11.25, -6, -3, M.glass);
// interior – ground
const F = G + 0.05;
boxB(0, 11.5, F, F + 0.02, -8.5, -2, M.fabricD, { cast: false });
boxB(1, 9, F, F + 0.45, -7.2, -5.6, M.fabric); boxB(1, 9, F, F + 0.95, -7.7, -7.2, M.fabric); boxB(9, 10.5, F, F + 0.45, -7.2, -3, M.fabric);
boxB(2, 3.2, F + .45, F + .75, -7.1, -6.6, M.fabricT); boxB(6.5, 7.7, F + .45, F + .75, -7.1, -6.6, M.fabricD);
boxB(3.5, 6.8, F, F + 0.34, -4.6, -3.3, M.dark);
boxB(-11.5, -5, F + 0.72, F + 0.8, -6.6, -5, M.wood); boxB(-11, -10.8, F, F + 0.72, -6.2, -5.4, M.dark); boxB(-5.7, -5.5, F, F + 0.72, -6.2, -5.4, M.dark);
for (let k = 0; k < 5; k++) for (const zz of [-7.3, -4.8]) boxB(-11 + k * 1.3, -10.45 + k * 1.3, F, F + (zz < -6 ? 0.9 : 0.48), zz, zz + 0.5, M.fabric);
boxB(-10.8, -5.7, F + 2.3, F + 2.36, -5.85, -5.75, gLamp, { cast: false });
boxB(12.2, 16.8, F, F + 0.92, -8, -6.5, M.dark); boxB(12.1, 16.9, F + 0.92, F + 0.98, -8.1, -6.4, M.slab);
boxB(10.5, 18, F, F + 2.6, -11.95, -11.3, M.dark);
for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), gLamp); s.position.set(13.2 + k * 1.3, F + 2.2, -7.25); scene.add(s); }
{ const a = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.4), M.art); a.position.set(-1, F + 1.75, -11.97); scene.add(a); }
{ const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), gLamp); s.position.set(0.2, F + 1.7, -7.3); scene.add(s); boxB(0.17, 0.23, F, F + 1.5, -7.33, -7.27, M.dark); }
// interior – upper
const F2 = 7.3;
boxB(3.5, 7, F2, F2 + 0.5, -5.4, -2.8, M.fabric); boxB(3.3, 7.2, F2, F2 + 1.3, -5.7, -5.4, M.wood); boxB(3.6, 6.9, F2 + .5, F2 + .62, -3.6, -2.9, M.fabricD);
boxB(-9, -5.8, F2, F2 + 0.5, -5.4, -2.8, M.fabric); boxB(-9.2, -5.6, F2, F2 + 1.3, -5.7, -5.4, M.wood);
boxB(13, 19, F2, F2 + 0.45, -6.8, -5.4, M.fabricD); boxB(13, 19, F2, F2 + 0.9, -7.3, -6.8, M.fabricD);
boxB(-0.2, 0.1, 7.25, 10.7, -8, 3.4, M.stucco); boxB(10.4, 10.7, 7.25, 10.7, -8, 3.4, M.stucco);
for (const x of [2.6, 7.9, -10, -4.8, 16]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), gLamp); s.position.set(x, F2 + 2.4, -4.6); scene.add(s); }

// outdoor furniture
function lounger(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, G, z); g.rotation.y = rot; scene.add(g);
  boxB(-0.4, 0.4, 0.18, 0.28, -1.05, 1.05, M.wood, { parent: g, nouv: true });
  boxB(-0.37, 0.37, 0.28, 0.4, -0.3, 1.05, M.fabric, { parent: g });
  const b = boxB(-0.37, 0.37, 0.28, 0.4, -1.05, -0.3, M.fabric, { parent: g }); b.rotation.x = -0.55; b.position.y += 0.2;
  for (const sx of [-0.35, 0.35]) for (const sz of [-0.9, 0.9]) boxB(sx - 0.03, sx + 0.03, 0, 0.18, sz - 0.03, sz + 0.03, M.dark, { parent: g });
}
function umbrella(x, y, z, r = 1.9, mat = M.fabric) {
  boxB(x - 0.04, x + 0.04, y, y + 2.5, z - 0.04, z + 0.04, M.dark);
  const c = new THREE.Mesh(new THREE.ConeGeometry(r, 0.7, 16, 1, true), mat.clone()); c.material.side = THREE.DoubleSide; c.position.set(x, y + 2.6, z); c.castShadow = true; scene.add(c);
}
for (const x of [23.6, 26, 28.4]) lounger(x, 14); umbrella(24.8, G, 12.4); umbrella(27.2, G, 12.4);
for (const x of [-4, -1.6, 13, 15.4, 17.8]) lounger(x, 6.9);
// fire lounge on deck
boxB(-27.5, -19.5, G, G + 0.42, 20.6, 22, M.fabric); boxB(-27.5, -26.1, G, G + 0.42, 15.5, 20.6, M.fabric); boxB(-20.9, -19.5, G, G + 0.42, 15.5, 20.6, M.fabric);
boxB(-27.9, -27.5, G, G + 0.85, 15.5, 22.3, M.dark); boxB(-19.5, -19.1, G, G + 0.85, 15.5, 22.3, M.dark); boxB(-27.9, -19.1, G, G + 0.85, 22, 22.3, M.dark);
boxB(-24.7, -22.3, G, G + 0.4, 17, 19.4, M.stone, { tile: 2 });
const fire = boxB(-24.3, -22.7, G + 0.4, G + 0.5, 17.4, 19, gFire, { cast: false });
const flames = [];
for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), gFire); f.position.set(-24.1 + rng() * 1.2, G + 0.75, 17.6 + rng() * 1.2); scene.add(f); flames.push(f); }
const fireLight = new THREE.PointLight(0xff7a2a, 0, 14, 2); fireLight.position.set(-23.5, G + 1.2, 18.2); scene.add(fireLight);
// pergola + outdoor dining
for (const x of [-28, -21]) for (const z of [1, 7.5]) boxB(x - 0.1, x + 0.1, G, G + 2.9, z - 0.1, z + 0.1, M.dark);
for (let k = 0; k < 15; k++) boxB(-28.3 + k * 0.54, -28.18 + k * 0.54, G + 2.9, G + 3.1, 0.6, 7.9, M.wood, { nouv: true });
boxB(-26.6, -22.4, G + 0.72, G + 0.8, 3.5, 5, M.wood); boxB(-26.3, -26.1, G, G + .72, 4.1, 4.4, M.dark); boxB(-22.9, -22.7, G, G + .72, 4.1, 4.4, M.dark);
for (let k = 0; k < 4; k++) for (const zz of [2.7, 5.3]) boxB(-26.3 + k * 1.05, -25.8 + k * 1.05, G, G + 0.48, zz, zz + 0.5, M.fabric);
boxB(-26.3, -22.7, G + 2.5, G + 2.55, 4.2, 4.3, gLed, { cast: false });
// planters
for (const [x, z] of [[-29, 22.6], [29, 22.6], [29, 1.5], [-29, 10.5], [20.4, 1.2]]) boxB(x - 0.9, x + 0.9, G, G + 0.6, z - 0.9, z + 0.9, M.dark);
// steps + boardwalk to the beach
for (let k = 0; k < 5; k++) boxB(-20.3, -15.7, 1, G - 0.25 * (k + 1), 24.7 + k * 0.5, 25.2 + k * 0.5, M.stone, { tile: 2 });
for (let k = 0; k < 44; k++) { const z = 27.6 + k * 0.62, x = -18 + Math.sin(k * 0.12) * 1.2; const p = boxB(x - 0.9, x + 0.9, 0, 0.07, -0.26, 0.26, M.wood, { nouv: true }); p.position.set(x, height(x, z) + 0.08, z); p.rotation.x = Math.atan((height(x, z + 0.5) - height(x, z - 0.5))) * -1; }
// LED lines along terrace steps and pool coping
boxB(-8, 22, G - 0.06, G - 0.03, 8.98, 9.02, gLed, { cast: false });
boxB(-30, 30, G + 0.01, G + 0.03, 0.3, 0.36, gLed, { cast: false });
for (let k = 0; k < 10; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), gLamp); s.position.set(-33, 4.75, -55 + k * 8.4); scene.add(s); const s2 = s.clone(); s2.position.x = 33; scene.add(s2); }
// beach set
{ const bx = -31, bz = 47, by = height(bx, bz);
  for (const dx of [-1.3, 1.3]) { const g = new THREE.Group(); g.position.set(bx + dx, by - G + 0.02, bz); scene.add(g); const keep = scene; lounger(bx + dx, bz); const l = scene.children[scene.children.length - 1]; l.position.y = by; }
  umbrella(bx, by, bz - 0.6, 2.2, new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 })); }
// back: driveway + garage
boxB(-6, 6, 2.9, 3.06, -62, -24, new THREE.MeshStandardMaterial({ color: 0x55524d, roughness: 0.9 }));
boxB(-32, -22, G - .2, 6.4, -24, -12, M.stucco); boxB(-32.5, -21.5, 6.4, 6.7, -24.5, -11.5, M.slab);
boxB(-1.2, 1.2, G, 6.2, -24.1, -24, M.wood, { nouv: true });

// interior + pool lights
const L1 = new THREE.PointLight(0xffc790, 0, 40, 1.6); L1.position.set(4, 6.2, -5); scene.add(L1);
const L2 = new THREE.PointLight(0xffc790, 0, 40, 1.6); L2.position.set(-9, 6.2, -5); scene.add(L2);
const L3 = new THREE.PointLight(0xffc790, 0, 40, 1.6); L3.position.set(6, 10, -2); scene.add(L3);
const L4 = new THREE.PointLight(0x58e6ff, 0, 30, 1.6); L4.position.set(7, 4.3, 15.5); scene.add(L4);

// ---------- palms ----------
function palmGeos() {
  const Ht = 9; const tr = new THREE.CylinderGeometry(0.17, 0.3, Ht, 10, 26, true); tr.translate(0, Ht / 2, 0);
  const p = tr.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / Ht; const r = 1 + 0.07 * Math.sin(t * 95) + 0.5 * Math.pow(1 - t, 6); p.setXYZ(i, p.getX(i) * r + 1.5 * t * t, y, p.getZ(i) * r); }
  tr.computeVertexNormals();
  const fr = [], N = 30;
  for (let i = 0; i < N; i++) {
    const L = 4.8 + rng() * 1.6, e = lerp(1.2, -0.6, Math.pow(i / (N - 1), 0.85)) + (rng() - .5) * 0.2, az = i * 2.399 + rng() * 0.3, D = 0.42 + rng() * 0.25;
    const g = new THREE.PlaneGeometry(2.1, L, 4, 9); const q = g.attributes.position;
    for (let k = 0; k < q.count; k++) { const x = q.getX(k), t = q.getY(k) / L + 0.5; const out = L * t * Math.cos(e) * (1 - 0.12 * t), up = L * t * Math.sin(e) - D * L * t * t - Math.abs(x) * 0.5; q.setXYZ(k, x, up, out); }
    g.rotateY(az); g.translate(1.5, Ht - 0.1, 0); g.computeVertexNormals(); fr.push(g);
  }
  return [tr, mergeGeometries(fr)];
}
const [trunkG, frondG] = palmGeos();
const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTex, roughness: 1 });
const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75 });
const palmList = [[-29, 22.6, G + .5], [29, 22.6, G + .5], [29, 1.5, G + .5], [-29, 10.5, G + .5], [20.4, 1.2, G + .5]].map(p => [p[0], p[2], p[1]]);
for (const [x, z] of [[-39, 30], [40, 31], [-47, 37], [47, 27], [-26, -18], [30, -14], [-29, -40], [28, -42], [12, -48], [-12, -50], [38, -30], [-39, -8], [-55, 20], [58, 16], [0, -66], [22, -70], [-24, -72]]) palmList.push([x, height(x, z) - 0.1, z]);
const NEAR_PALMS = palmList.length;
for (let i = 0; i < 55; i++) { const x = (rng() - .5) * 900, z = 10 - rng() * 320; if (Math.abs(x) < 60 && z > -80) continue; if (shoreZ(x) - z < 30) continue; palmList.push([x, height(x, z) - 0.2, z]); }
const palmMeshes = [];
{ const d = new THREE.Object3D();
  for (const [from, to, shadow] of [[0, NEAR_PALMS, true], [NEAR_PALMS, palmList.length, false]]) {
    const tr = new THREE.InstancedMesh(trunkG, trunkMat, to - from), fr = new THREE.InstancedMesh(frondG, frondMat, to - from);
    for (let i = from; i < to; i++) { const p = palmList[i]; d.position.set(p[0], p[1], p[2]); d.rotation.set(0, rng() * 6.28, 0); const sc = 0.75 + rng() * 0.5; d.scale.set(sc, sc * (0.85 + rng() * 0.35), sc); d.updateMatrix(); tr.setMatrixAt(i - from, d.matrix); fr.setMatrixAt(i - from, d.matrix); }
    tr.castShadow = fr.castShadow = shadow; tr.receiveShadow = true; tr.frustumCulled = fr.frustumCulled = false; scene.add(tr, fr); palmMeshes.push(tr, fr);
  } }
// bushes
{ const g = new THREE.IcosahedronGeometry(1, 1); const N = 900; const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x4b5a2a, roughness: 1 }), N); const d = new THREE.Object3D(); const c = new THREE.Color(); let n = 0;
  while (n < N) { const x = (rng() - .5) * 1400, z = 30 - rng() * 420; const s = shoreZ(x) - z; if (s < 36 || padMask(x, z) > 0.02) continue; if (fbm(x * 0.035 + 2, z * 0.035) < 0.42 && rng() > 0.15) continue;
    const sc = 0.5 + rng() * 1.7; d.position.set(x, height(x, z) + sc * 0.25, z); d.scale.set(sc * (1 + rng()), sc * 0.55, sc * (1 + rng())); d.rotation.y = rng() * 6; d.updateMatrix(); im.setMatrixAt(n, d.matrix); im.setColorAt(n, c.setHSL(0.15 + rng() * 0.1, 0.3, 0.3 + rng() * 0.14)); n++; }
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
  // garden shrubs inside the plot
  const N2 = 60, im2 = new THREE.InstancedMesh(g, M.hedge, N2);
  for (let i = 0; i < N2; i++) { const side = i % 2 ? 1 : -1; const x = side * (23 + rng() * 8), z = -58 + rng() * 54; const sc = 0.6 + rng() * 0.8; d.position.set(x, 3.0 + sc * 0.4, z); d.scale.set(sc * 1.3, sc, sc * 1.3); d.updateMatrix(); im2.setMatrixAt(i, d.matrix); }
  im2.castShadow = true; scene.add(im2); }

// ---------- post ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Q('aa') ?? 0 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (isnan(c.r) || isnan(c.g) || isnan(c.b)) c = vec3(0.0); gl_FragColor = vec4(clamp(c, 0.0, 24.0), 1.0); }` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.75, 1.15); composer.addPass(bloom);
if (Q('nobloom')) bloom.enabled = false;
composer.addPass(new OutputPass());
if (!Q('nosmaa')) composer.addPass(new SMAAPass(W, H));
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, fade: { value: 1 }, seed: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float fade; uniform float seed; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, 1.12);
      c = mix(c, c*c*(3.0-2.0*c), 0.35);
      c += vec3(0.012,0.0,-0.012) * (l-0.4);
      vec2 q = vUv-0.5; float v = smoothstep(0.95, 0.25, length(q*vec2(1.0,0.82)));
      c *= mix(0.62, 1.0, v);
      float g = fract(sin(dot(vUv*vec2(1920.0,1080.0)+seed, vec2(12.9898,78.233)))*43758.5453)-0.5;
      c += g*0.014;
      gl_FragColor = vec4(c*fade, 1.0); }`
});
composer.addPass(grade);

// ---------- environment ----------
const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); let envRT = null, envKey = -1;
function updateEnv() { envScene.add(clouds); const n = pmrem.fromScene(envScene, 0, 1, 30000); scene.add(clouds); if (envRT) envRT.dispose(); envRT = n; scene.environment = n.texture; }

// ---------- camera choreography ----------
const CUTS = [0, 8, 16, 24, 32, 40, 50];
const P = new THREE.Vector3(), T = new THREE.Vector3();
const sunH = new THREE.Vector3(-Math.sin(0.49), 0, Math.cos(0.49));
function shot(t) {
  let k = 0; while (k < 5 && t >= CUTS[k + 1]) k++;
  const u = (t - CUTS[k]) / (CUTS[k + 1] - CUTS[k]); let fov = 50, roll = 0, up = null;
  if (k === 0) { const e = 1 - Math.pow(1 - u, 2.2); P.set(lerp(-70, -16, e), 1.9 + 15 * Math.pow(smooth(0.45, 1, u), 1.5), lerp(400, 92, e)); T.set(0, lerp(9, 5.5, u), lerp(60, 0, u)); fov = 56; roll = 0.045 * Math.sin(u * 5); }
  else if (k === 1) { const e = lerp(u, ease(u), 0.5), th = lerp(-1.05, 0.72, e), R = lerp(74, 50, e); P.set(2 + R * Math.sin(th), lerp(21, 8.5, e), 2 + R * Math.cos(th)); T.set(2, 6, 0); fov = 44; }
  else if (k === 2) { const e = ease(u); P.set(lerp(4, 9, e), lerp(96, 62, e), 36); T.set(P.x, 3, 36.01); const a = lerp(-0.5, 0.25, e); up = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); fov = 50; }
  else if (k === 3) { const e = Math.pow(u, 1.35); const d = lerp(0, 66, e); P.set(10.5 + sunH.x * d, 4.35 - 0.25 * smooth(0, .25, e) + 5.5 * Math.pow(smooth(0.4, 1, e), 2), 3.6 + sunH.z * d); T.copy(P).addScaledVector(sunH, 100); T.y = P.y + 4 + 6 * u; fov = 58; }
  else if (k === 4) { const e = lerp(u, ease(u), 0.4); P.set(lerp(36, -24, e), lerp(5.0, 6.4, e), lerp(31, 28, e)); T.set(P.x * 0.45 - 1, 6.4, 0); fov = 40; }
  else { const e = ease(Math.pow(u, 0.9)); P.set(lerp(9, 18, e), lerp(5.2, 15, e * e), lerp(34, 104, e)); T.set(2, lerp(6.6, 14, e), 0); fov = 44; }
  return { fov, roll, up, k };
}
const titles = [['t1', 1.6, 7.3], ['t2', 9.3, 15.2], ['t3', 17.3, 23.2], ['t4', 25.5, 31.2], ['t5', 33.3, 39.2], ['t6', 43.2, 51]].map(([id, a, b]) => [document.getElementById(id), a, b]);

const sunCol = new THREE.Color();
function setFrame(f) {
  const t = f / FPS;
  // sun
  const keys = [[0, 7], [16, 5.2], [24, 4.2], [32, 3.0], [40, 1.6], [50, -0.9]];
  let el = keys[0][1]; for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i][0]) el = lerp(keys[i][1], keys[i + 1][1], clamp((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]), 0, 1));
  const er = el * Math.PI / 180; sunDir.set(sunH.x * Math.cos(er), Math.sin(er), sunH.z * Math.cos(er)).normalize();
  const night = smooth(14, 45, t), day = smooth(-1.4, 3.5, el), dayF = smooth(-1.5, 4.5, el);
  cloudMat.uniforms.dayF.value = dayF;
  sunCol.setRGB(1, lerp(0.40, 0.66, smooth(0, 7, el)), lerp(0.14, 0.36, smooth(0, 7, el)));
  sun.color.copy(sunCol); sun.intensity = 6.5 * day;
  sun.target.position.set(0, 4, 0); sun.position.copy(sun.target.position).addScaledVector(sunDir.clone().setY(Math.max(sunDir.y, 0.035)).normalize(), 400);
  hemi.intensity = lerp(0.42, 0.3, night); hemi.color.setRGB(lerp(0.72, 0.5, night), lerp(0.74, 0.5, night), 1);
  water.material.uniforms.sunDirection.value.copy(sunDir); water.material.uniforms.sunColor.value.copy(sunCol).multiplyScalar(0.3 + 0.7 * day);
  water.material.uniforms.time.value = t * 0.55;
  shoreMat.uniforms.time.value = t; shoreMat.uniforms.light.value.setRGB(lerp(0.5, 1.5, dayF), lerp(0.42, 1.1, dayF), lerp(0.5, 0.85, dayF));
  cloudMat.uniforms.time.value = t;
  renderer.toneMappingExposure = lerp(0.62, 0.95, 1 - dayF);
  scene.fog.color.setRGB(lerp(0.42, 1.0, dayF), lerp(0.25, 0.62, dayF), lerp(0.33, 0.42, dayF));
  for (const [m, d, n] of glows) m.emissiveIntensity = lerp(d, n, night);
  L1.intensity = L2.intensity = 8 + 40 * night; L3.intensity = 6 + 34 * night; L4.intensity = 0;
  const fl = 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1); fireLight.intensity = (8 + 30 * night) * fl;
  flames.forEach((m, i) => { m.scale.y = 0.6 + 0.8 * Math.abs(Math.sin(t * (9 + i) + i * 2)); m.position.y = G + 0.5 + 0.3 * m.scale.y; });
  poolNormals.offset.set(t * 0.012, t * 0.02);
  bloom.strength = lerp(0.28, 0.42, night);
  // camera
  const s = shot(t); camera.fov = s.fov; camera.updateProjectionMatrix();
  camera.position.copy(P); camera.up.copy(s.up || new THREE.Vector3(0, 1, 0)); camera.lookAt(T); if (s.roll) camera.rotateZ(s.roll);
  clouds.position.copy(camera.position);
  const key = Math.floor(f / (Q('env') ?? 15)); if (key !== envKey) { envKey = key; updateEnv(); }
  // fades: open, close, soft dip at cuts
  let fade = smooth(0, 1.2, t) * (1 - smooth(DURATION - 1.3, DURATION - 0.1, t));
  for (let i = 1; i < 6; i++) fade *= 0.25 + 0.75 * smooth(0, 0.3, Math.abs(t - CUTS[i]));
  grade.uniforms.fade.value = fade; grade.uniforms.seed.value = f * 1.37;
  for (const [el2, a, b] of titles) { const o = smooth(a, a + 0.9, t) * (1 - smooth(b - 0.7, b, t)); el2.style.opacity = o.toFixed(3); el2.style.transform = `translateY(${((1 - smooth(a, a + 1.6, t)) * 26).toFixed(1)}px)`; el2.style.letterSpacing = ''; }
  composer.render();
}
const px = new Uint8Array(4);
window.renderFrame = f => { setFrame(f); const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return true; };
window.TOTAL = FPS * DURATION;
if (Q('nosky')) clouds.material = new THREE.MeshBasicMaterial({ color: 0x8090c0, side: THREE.BackSide });
if (Q('noshadow')) renderer.shadowMap.enabled = false;
if (Q('nopl')) [L1, L2, L3, L4, fireLight].forEach(l => l.visible = false);
if (Q('nowater')) water.visible = false;
if (Q('noterrain')) scene.children.filter(o => o.material && o.material.vertexColors).forEach(o => o.visible = false);
if (Q('nopalms')) palmMeshes.forEach(m => m.visible = false);
await Promise.all(['300 20px Frank','500 20px Frank','300 20px Heebo'].map(f => document.fonts.load(f, '₪ 68,000,000 אבג abc')));
await document.fonts.ready;
await new Promise(r => { const chk = () => waterNormals.image ? r() : setTimeout(chk, 30); chk(); });
setFrame(parseInt(params.get('f') || '0'));
window.READY = true;
