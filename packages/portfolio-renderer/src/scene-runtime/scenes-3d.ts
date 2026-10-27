import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene as ThreeScene,
  ShaderMaterial,
  TorusKnotGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry,
  type Object3D,
} from "three";

import { unitColor } from "./ink.js";
import type { Scene, SceneColors, SceneFactory, SceneFrame } from "./host.js";

/**
 * three.js 3D 장면 셋입니다.
 *
 * 셰이더는 색 공간 변환(`colorspace_fragment`)을 넣지 않아 출력값이 그대로 화면 색입니다. 출력은
 * `mix(바탕, 잉크, f)`(빛 부류는 그 위에 두 번째 잉크를 한 번 더 섞음)이고 f는 0–1로 자릅니다. 투명 바탕의 캔버스라
 * 비어 있는 픽셀은 층의 CSS 바탕색(`--xp-bd-base`)이 그대로 보입니다.
 */

/** Ashima Arts 3D 심플렉스 노이즈(MIT, github.com/ashima/webgl-noise)입니다. 표면 일렁임과 지형 높이에 씁니다. */
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const COLOR_UNIFORMS = `uniform vec3 uBackground;uniform vec3 uInk1;uniform vec3 uInk2;`;

function colorUniforms(colors: SceneColors) {
  return {
    uBackground: { value: new Vector3(...unitColor(colors.background)) },
    uInk1: { value: new Vector3(...unitColor(colors.inks[0])) },
    uInk2: { value: new Vector3(...unitColor(colors.inks[1])) },
  };
}

/** 렌더러 · 카메라 · 크기 맞춤을 묶은 공통 틀입니다. */
function stage(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  const scene = new ThreeScene();
  let size = "";
  const fit = (frame: SceneFrame) => {
    const next = `${frame.width}x${frame.height}`;
    if (next === size) return;
    size = next;
    renderer.setPixelRatio(1);
    renderer.setSize(frame.width, frame.height, false);
    camera.aspect = frame.width / frame.height;
    camera.updateProjectionMatrix();
  };
  return { renderer, camera, scene, fit };
}

/**
 * 넓은 화면에서는 오른쪽에, 좁은 화면에서는 위쪽에 둡니다. 이름 · 소개 글이 왼쪽 · 아래에 놓이기 때문입니다.
 * 카메라 시야의 가로 · 세로 반폭(거리 기준)에서 위치를 계산합니다.
 */
function place(object: Object3D, camera: PerspectiveCamera, distance: number, base: number) {
  const halfHeight = Math.tan(((camera.fov / 2) * Math.PI) / 180) * distance;
  const halfWidth = halfHeight * camera.aspect;
  if (camera.aspect >= 1.1) {
    object.position.set(halfWidth * 0.48, halfHeight * 0.12, 0);
    object.scale.setScalar(base);
  } else {
    object.position.set(halfWidth * 0.25, halfHeight * 0.5, 0);
    object.scale.setScalar(base * Math.max(0.55, camera.aspect));
  }
}

function disposeAll(renderer: WebGLRenderer, ...objects: { geometry: BufferGeometry; material: ShaderMaterial | ShaderMaterial[] }[]) {
  for (const object of objects) {
    object.geometry.dispose();
    for (const material of ([] as ShaderMaterial[]).concat(object.material)) material.dispose();
  }
  renderer.dispose();
}

/** 표면이 천천히 일렁이는 구체입니다. 가장자리는 첫 잉크, 솟은 자리는 두 번째 잉크로 물들고 포인터 쪽으로 기울어집니다. */
export const orb: SceneFactory = (canvas, colors) => {
  const { renderer, camera, scene, fit } = stage(canvas);
  camera.position.set(0, 0, 6);
  const material = new ShaderMaterial({
    uniforms: { ...colorUniforms(colors), uTime: { value: 0 } },
    vertexShader: `${NOISE}
uniform float uTime;varying vec3 vNormal;varying float vLift;
void main(){
  float lift=snoise(normal*1.4+vec3(uTime*0.18,uTime*0.11,0.0))*0.5+0.5;
  vec3 moved=position+normal*lift*0.22;
  vLift=lift;vNormal=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(moved,1.0);
}`,
    fragmentShader: `${COLOR_UNIFORMS}varying vec3 vNormal;varying float vLift;
void main(){
  float rim=clamp(pow(1.0-abs(vNormal.z),1.4)*0.85+0.25,0.0,1.0);
  float glow=clamp(smoothstep(0.45,0.95,vLift)*(0.55+0.45*vNormal.y),0.0,1.0);
  gl_FragColor=vec4(mix(mix(uBackground,uInk1,rim),uInk2,glow),1.0);
}`,
  });
  const mesh = new Mesh(new IcosahedronGeometry(1, 48), material);
  scene.add(mesh);
  const scene3d: Scene = {
    frame(frame) {
      fit(frame);
      place(mesh, camera, 6, 1.55);
      material.uniforms.uTime!.value = frame.time;
      mesh.rotation.y = frame.time * 0.08 + frame.pointer.x * 0.5 * frame.pointer.strength;
      mesh.rotation.x = -frame.pointer.y * 0.4 * frame.pointer.strength;
      renderer.render(scene, camera);
    },
    dispose: () => disposeAll(renderer, mesh),
  };
  return scene3d;
};

/** 점으로 된 지형이 흐릅니다. 포인터 아래 자리가 솟습니다. 가까운 점일수록 잉크에 가깝습니다. */
export const terrain: SceneFactory = (canvas, colors) => {
  const { renderer, camera, scene, fit } = stage(canvas);
  camera.position.set(0, 2.2, 6.5);
  camera.lookAt(0, 0, 0);
  const columns = 150;
  const rows = 80;
  const positions: number[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) positions.push((column / (columns - 1) - 0.5) * 18, 0, (row / (rows - 1) - 0.5) * 10);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new ShaderMaterial({
    uniforms: { ...colorUniforms(colors), uTime: { value: 0 }, uPointer: { value: new Vector2() }, uPull: { value: 0 }, uSize: { value: 2 } },
    vertexShader: `${NOISE}
uniform float uTime;uniform vec2 uPointer;uniform float uPull;uniform float uSize;varying float vAmount;
void main(){
  vec3 p=position;
  float height=snoise(vec3(p.x*0.22,p.z*0.3,uTime*0.12))*0.55;
  float near=exp(-dot(p.xz-uPointer,p.xz-uPointer)*0.35)*uPull;
  p.y=height+near*1.1;
  vec4 view=modelViewMatrix*vec4(p,1.0);
  float depth=clamp((-view.z-2.0)/12.0,0.0,1.0);
  vAmount=clamp((1.0-depth)*(0.45+(height+0.55)*0.5+near*0.6),0.0,1.0);
  gl_PointSize=uSize*(1.6-depth);
  gl_Position=projectionMatrix*view;
}`,
    fragmentShader: `${COLOR_UNIFORMS}varying float vAmount;
void main(){
  if(length(gl_PointCoord-0.5)>0.5) discard;
  gl_FragColor=vec4(mix(uBackground,uInk1,vAmount),1.0);
}`,
  });
  const points = new Points(geometry, material);
  scene.add(points);
  return {
    frame(frame) {
      fit(frame);
      material.uniforms.uTime!.value = frame.time;
      material.uniforms.uSize!.value = 2.4 * frame.pixelRatio;
      // 포인터를 지형 평면 위 좌표로 옮깁니다. 화면 가로는 지형 가로, 화면 세로는 지형 깊이에 대응합니다.
      (material.uniforms.uPointer!.value as Vector2).set(frame.pointer.x * 7, -frame.pointer.y * 3.5 + 1);
      material.uniforms.uPull!.value = frame.pointer.strength;
      points.rotation.y = Math.sin(frame.time * 0.05) * 0.08;
      renderer.render(scene, camera);
    },
    dispose: () => disposeAll(renderer, points),
  };
};

/** 선으로 된 매듭이 천천히 돌고 포인터 쪽으로 기울어집니다. 앞쪽 선일수록 잉크에 가깝습니다. */
export const knot: SceneFactory = (canvas, colors) => {
  const { renderer, camera, scene, fit } = stage(canvas);
  camera.position.set(0, 0, 7);
  const source = new TorusKnotGeometry(1, 0.3, 200, 14, 2, 3);
  const geometry = new WireframeGeometry(source);
  source.dispose();
  const material = new ShaderMaterial({
    uniforms: colorUniforms(colors),
    vertexShader: `varying float vAmount;
void main(){
  vec4 view=modelViewMatrix*vec4(position,1.0);
  vAmount=clamp(0.2+(view.z+8.5)*0.45,0.0,1.0);
  gl_Position=projectionMatrix*view;
}`,
    fragmentShader: `${COLOR_UNIFORMS}varying float vAmount;
void main(){gl_FragColor=vec4(mix(uBackground,uInk1,vAmount),1.0);}`,
  });
  const lines = new LineSegments(geometry, material);
  scene.add(lines);
  return {
    frame(frame) {
      fit(frame);
      place(lines, camera, 7, 1.35);
      lines.rotation.x = frame.time * 0.1 - frame.pointer.y * 0.5 * frame.pointer.strength;
      lines.rotation.y = frame.time * 0.14 + frame.pointer.x * 0.6 * frame.pointer.strength;
      renderer.render(scene, camera);
    },
    dispose: () => disposeAll(renderer, lines),
  };
};
