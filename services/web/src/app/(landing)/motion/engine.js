/*
 * 3d-motion-web 엔진(사용자 스킬 `~/.claude/skills/3d-motion-web/assets/engine.js`)을 그대로 들여온 것.
 * 랜딩 첫 화면의 에스프레소 잔을 WebGPU 로 그린다. **손으로 고치지 않는다** — 스킬 쪽을 고치고 다시 들여온다.
 * 들여온 날: 2026-11-02. `window.MotionWeb` 을 정의한다. 원본과 다른 곳은 맨 끝의 `export {};` 한 줄뿐이다(동적 import 용).
 */
/*
 * 3d-motion-web 엔진 — WebGPU / WGSL.
 *
 * 이 파일은 **배관만** 담습니다. 그림은 저자가 씁니다.
 *
 * 여기 들어 있는 것들은 전부 실제로 한 번씩 깨져 보고 고친 것들입니다.
 * 값을 바꾸거나 단계를 건너뛰기 전에 각 주석의 이유를 먼저 읽으십시오.
 *
 * ── 저자가 쓰는 WGSL 계약 ──────────────────────────────────
 *
 *   fn map(p: vec3f) -> f32
 *       거리장. 형태를 정합니다. 필수.
 *
 *   fn shadeSurface(p: vec3f, n: vec3f, rd: vec3f, occ: f32, fres: f32) -> vec3f
 *       맞은 지점의 색. 재질과 빛을 정합니다. 필수.
 *       occ  = 주변 차폐 0(막힘)~1(열림)
 *       fres = 프레넬 항 0(정면)~1(스침)
 *
 *   fn background(uv: vec2f) -> vec3f          선택. 없으면 검정
 *   fn cameraOrigin() -> vec3f                 선택. 없으면 u.cam
 *   fn cameraFov() -> f32                      선택. 없으면 1.45
 *   fn postProcess(c: vec3f, uv: vec2f) -> vec3f   선택. 없으면 그대로
 *
 *   **WGSL 은 선언 순서를 따지지 않습니다.** GLSL 처럼 전방 선언을 넣을
 *   필요가 없고, 저자 블록 안에서 순서를 신경 쓰지 않아도 됩니다.
 *
 * ── 엔진이 주는 uniform ────────────────────────────────────
 *
 *   구조체 하나에 담겨 `u.` 로 들어옵니다.
 *
 *     u.res       vec2f  백킹 스토어 픽셀 크기
 *     u.time      f32    초
 *     u.seed      f32    시드
 *     u.noiseSeed vec3f  시드에서 파생한 노이즈 오프셋. 노이즈 좌표에 더하십시오
 *     u.cam       vec3f  카메라 위치 (create({camera}) 가 채웁니다)
 *     u.wide      f32    화면비 0(아주 좁음)~1(넓음)
 *     u.scroll    f32    문서 스크롤 진행도 0~1, 관성이 걸린 값
 *     u.focus u.aperture u.vignette u.chroma u.grain   렌즈
 *
 *   create({uniforms: {accent: [r,g,b]}}) 로 넘긴 것은 같은 구조체에
 *   붙어 `u.accent` 로 들어옵니다. GLSL 시절의 `u` 접두사(uAccent)는
 *   이제 군더더기입니다 — 이름을 그냥 `accent` 로 두십시오.
 *
 * ── 엔진이 주는 WGSL 헬퍼 ──────────────────────────────────
 *
 *   @vgpu/wgsl-std 전체가 인라인되어 있습니다 (assets/wgsl-std.wgsl):
 *     perlin2d perlin3d fbmPerlin2d fbmPerlin3d
 *     simplex2d simplex3d fbmSimplex2d fbmSimplex3d
 *     voronoi2d voronoi3d  (VoronoiSample2/3 를 돌려줍니다)
 *     hash1 hash2 hash3 pcg2d pcg3d hashU32 unitFloat
 *     tonemapAces tonemapReinhard luminance applyExposure luminanceThreshold
 *     srgbToLinear3 linearToSrgb3 lambert
 *     saturate clamp01 remap inverseLerp safeNormalize2/3/4 rotate2d
 *     pi tau halfPi goldenRatio goldenAngle
 *     vogelDisk hammersley2d radicalInverseVdc
 *     fullscreenTriangleClip fullscreenTriangleUv
 *
 *   **노이즈 범위가 GLSL 시절과 다릅니다.** 예전 hash 기반 noise() 는
 *   0~1 이었고 perlin/simplex 는 -1~1 입니다. 0~1 이 필요하면
 *   `perlin3d(p) * 0.5 + 0.5` 로 옮기십시오.
 *
 *   엔진이 따로 얹는 것:
 *     rot2(a) -> mat2x2f          2D 회전 행렬
 *     softShadow(ro, rd) -> f32   부드러운 그림자
 *
 * ── uv 방향 ────────────────────────────────────────────────
 *
 *   uv 는 **y 가 위로 자랍니다**(Shadertoy·WebGL 관습). WebGPU 의
 *   @builtin(position) 은 y 가 아래로 자라므로 엔진이 경계에서 한 번만
 *   뒤집습니다. 셰이더 안에서는 다시 뒤집지 마십시오.
 */
(function (global) {
  "use strict";

  /* ── 엔진 uniform 필드 ────────────────────────────────────
     WGSL uniform 주소 공간 정렬 규칙에 맞춰 배치합니다.
       f32   align 4  size 4
       vec2f align 8  size 8
       vec3f align 16 size 12
       vec4f align 16 size 16
     구조체 전체 크기는 16 의 배수로 올립니다. */
  var ENGINE_FIELDS = [
    ["res",       "vec2f"],
    ["time",      "f32"],
    ["seed",      "f32"],
    ["cam",       "vec3f"],
    ["wide",      "f32"],
    ["noiseSeed", "vec3f"],
    ["scroll",    "f32"],
    ["focus",     "f32"],
    ["aperture",  "f32"],
    ["vignette",  "f32"],
    ["chroma",    "f32"],
    ["grain",     "f32"]
  ];

  var TYPE_INFO = {
    "f32":   { align: 4,  size: 4,  n: 1 },
    "vec2f": { align: 8,  size: 8,  n: 2 },
    "vec3f": { align: 16, size: 12, n: 3 },
    "vec4f": { align: 16, size: 16, n: 4 }
  };

  /* JS 값의 모양으로 WGSL 타입을 정합니다.
       number      -> f32
       [a,b]       -> vec2f
       [a,b,c]     -> vec3f
       [a,b,c,d]   -> vec4f
       [[..],..]   -> array<vec4f, N>
     배열을 vec4f 로 올리는 이유: uniform 주소 공간에서 배열 원소 stride 는
     16 의 배수여야 합니다. vec3f 배열은 stride 가 12 라 그대로 쓸 수 없어
     드라이버마다 다르게 어긋납니다. 넷째 성분은 0 으로 채우니 저자는
     `.xyz` 로 읽으십시오. */
  function inferType(v) {
    if (typeof v === "number") return { kind: "f32" };
    if (!v || !v.length) return null;
    if (Array.isArray(v[0])) {
      return { kind: "array", count: v.length, elem: "vec4f", lanes: v[0].length };
    }
    if (v.length === 2) return { kind: "vec2f" };
    if (v.length === 4) return { kind: "vec4f" };
    return { kind: "vec3f" };
  }

  function align(offset, a) { return Math.ceil(offset / a) * a; }

  /* 엔진 필드 + 저자 uniform 을 하나의 WGSL 구조체로 만들고, 각 필드의
     바이트 오프셋을 함께 돌려줍니다. 버퍼가 하나면 바인딩도 하나이고,
     프레임마다 writeBuffer 한 번으로 끝납니다. */
  function buildUniformStruct(engineFields, userUniforms) {
    var lines = [], slots = [], off = 0;

    engineFields.forEach(function (f) {
      var t = TYPE_INFO[f[1]];
      off = align(off, t.align);
      lines.push("  " + f[0] + ": " + f[1] + ",");
      slots.push({ name: f[0], kind: f[1], offset: off, lanes: t.n });
      off += t.size;
    });

    Object.keys(userUniforms).forEach(function (name) {
      var info = inferType(userUniforms[name]);
      if (!info) throw new Error("uniform '" + name + "' 의 값 모양을 알 수 없습니다");
      if (info.kind === "array") {
        off = align(off, 16);
        lines.push("  " + name + ": array<vec4f, " + info.count + ">,");
        slots.push({ name: name, kind: "array", offset: off,
                     count: info.count, lanes: info.lanes });
        off += 16 * info.count;
      } else {
        var t = TYPE_INFO[info.kind];
        off = align(off, t.align);
        lines.push("  " + name + ": " + info.kind + ",");
        slots.push({ name: name, kind: info.kind, offset: off, lanes: t.n });
        off += t.size;
      }
    });

    return {
      wgsl: "struct Engine {\n" + lines.join("\n") + "\n}\n" +
            "@group(0) @binding(0) var<uniform> u: Engine;\n",
      size: Math.max(16, align(off, 16)),
      slots: slots
    };
  }

  /* ── 환경맵 ──────────────────────────────────────────────
     RGBM 등직사각 두 장 — 선명한 것과 코사인 로브로 흐린 것. 거칠기로
     둘을 섞습니다. `envMap` 을 넘기지 않으면 이 블록이 아예 셰이더에
     들어가지 않으므로, 텍스처를 안 쓰는 지면은 비용이 0 입니다.

     RGBM 인데 지수가 4인 이유는 `scripts/hdri-to-envmap.py` 에 적혀 있습니다
     — RGBE 는 정확하지만 파일이 2배이고 지수 채널이 2의 거듭제곱으로 뛰어서
     하드웨어 보간을 못 씁니다.

     GLSL 시절과 달라진 것: `envMap(dir)` 1인자 판이 없습니다. WGSL 에는
     함수 오버로드가 없어서 `envMap(dir, rough)` 하나로 모읍니다. */
  var ENVMAP = [
    "@group(0) @binding(1) var envSharp: texture_2d<f32>;",
    "@group(0) @binding(2) var envBlur:  texture_2d<f32>;",
    "@group(0) @binding(3) var envSamp:  sampler;",
    "",
    "fn h3Rgbm(t: vec4f) -> vec3f {",
    "  var a = t.a * t.a; a = a * a;",   // pow(a, 4)
    "  return t.rgb * a * u.envCfg.x;",
    "}",
    /* 등직사각 좌표. v=0 이 위쪽(+Y)이고, 업로드할 때 뒤집지 않으므로
       PNG 의 첫 행이 그대로 하늘입니다. */
    "fn h3Equirect(d: vec3f) -> vec2f {",
    "  let c = cos(u.envCfg.y); let s = sin(u.envCfg.y);",
    /* WGSL 은 스위즐에 대입할 수 없습니다. GLSL 의 `d.xz = mat2(...) * d.xz`
       를 그대로 옮기면 컴파일이 죽습니다 — 새 벡터를 만듭니다. */
    "  let xz = mat2x2f(c, -s, s, c) * vec2f(d.x, d.z);",
    "  return vec2f(atan2(xz.x, xz.y) * 0.1591549431 + 0.5,",
    "               acos(clamp(d.y, -1.0, 1.0)) * 0.3183098862);",
    "}",
    /* ── 색조 리맵 ────────────────────────────────────────
       **촬영 HDRI 는 중성입니다.** 그대로 쓰면 컨셉트 컬러가 표면에서
       사라지고, 팔레트가 입력이라는 이 스킬의 전제가 무너집니다.

       그렇다고 환경에 색을 곱하면 안 됩니다 — 사진에 필터를 씌운 티가
       나고, 무엇보다 크롬을 크롬으로 만드는 **흰 하이라이트가 물듭니다.**

       그래서 **밝기는 원본 그대로 두고 색도만 갈아 끼웁니다.** 로그 휘도로
       세 구간을 나눠 어두운 쪽·중간·밝은 쪽에 각각 다른 색조를 주고,
       색조를 휘도 1로 정규화해 곱합니다. HDRI 의 구조와 다이내믹 레인지가
       그대로 살아 있고 색만 우리 것이 됩니다.

       실제 촬영에서 **필 라이트에만 젤을 씌우는 것**과 같은 구조입니다 —
       키 라이트의 심지는 희게 두고 넓은 반사면을 물들입니다. */
    "fn h3Tint(c: vec3f) -> vec3f {",
    "  if (u.envTint.x < 0.001) { return c; }",
    /* 선형으로 나누면 HDR 범위 특성상 거의 전부 '어두움'에 몰립니다.
       평균 휘도로 나눈 뒤 로그를 씌워야 구간이 고르게 걸리고, 어느
       HDRI 를 넣어도 같은 설정이 같은 결과를 냅니다. */
    "  let k = saturate(log2(1.0 + luminance(c) / max(u.envTint.z, 1e-4)) * 0.42);",
    "  var t = mix(u.envLo, u.envMid, smoothstep(0.0, u.envTint.y, k));",
    "  t = mix(t, u.envHi, smoothstep(u.envTint.y, 1.0, k));",
    /* 색조를 휘도 1로 정규화해 곱합니다 — 이래야 밝기가 보존됩니다. */
    "  return mix(c, c * (t / max(luminance(t), 1e-4)), u.envTint.x);",
    "}",
    /* ── 젤 조명 ──────────────────────────────────────────
       색조 리맵이 팔레트를 되찾아 주기는 하는데, 방향이 없습니다 — 표면
       전체가 고르게 물들 뿐 "여기서 빛이 온다"는 느낌이 없습니다. 그래서
       스튜디오에 **색 조명을 하나 더 세웁니다.**

       방위각만 좁히고 고도는 풉니다. 점광원은 동그란 점을 찍을 뿐이고,
       긴 줄기는 이 형태에서만 나옵니다.

       **거칠기를 따라 함께 넓어져야 합니다.** 손으로 적으면 대개 이걸
       빠뜨리는데, 그러면 주변이 다 뭉개진 거친 표면에서 젤 줄기만 면도날
       처럼 남아 붙여 놓은 티가 납니다. */
    "fn h3Gel(d: vec3f, rough: f32) -> vec3f {",
    "  if (u.gelCfg.z < 0.0001) { return vec3f(0.0); }",
    "  let w = max(u.gelCfg.y * (1.0 - saturate(rough) * 0.85), 1.5);",
    "  var s = pow(max(cos(atan2(d.z, d.x) - u.gelCfg.x), 0.0), w);",
    /* 넓어지면 줄기가 품는 총 에너지가 늘어납니다. 보정하지 않으면 거친
       재질이 매끄러운 재질보다 밝아집니다. cos^w 의 적분이 1/sqrt(w) 이라
       sqrt 비율로 되돌립니다. */
    "  s = s * sqrt(w / max(u.gelCfg.y, 1.0));",
    "  return u.gelCol * s * (0.45 + 0.55 * (d.y * 0.5 + 0.5)) * u.gelCfg.z;",
    "}",
    "fn envMap(dir: vec3f, rough: f32) -> vec3f {",
    "  let n = normalize(dir);",
    "  let uv = h3Equirect(n);",
    "  let a = h3Rgbm(textureSampleLevel(envSharp, envSamp, uv, 0.0));",
    "  let b = h3Rgbm(textureSampleLevel(envBlur,  envSamp, uv, 0.0));",
    /* 젤은 색조 리맵 **뒤에** 더합니다. 리맵은 촬영된 스튜디오의 색을
       갈아 끼우는 것이고, 젤은 우리가 새로 세운 조명입니다. */
    "  return h3Tint(mix(a, b, saturate(rough))) * u.envCfg.z + h3Gel(n, rough);",
    "}",
    /* 색조를 걸지 않은 원본이 필요할 때 — 예를 들어 하이라이트만 중성으로
       두고 확산 쪽만 물들이고 싶을 때 씁니다. */
    "fn envMapRaw(dir: vec3f, rough: f32) -> vec3f {",
    "  let uv = h3Equirect(normalize(dir));",
    "  let a = h3Rgbm(textureSampleLevel(envSharp, envSamp, uv, 0.0));",
    "  let b = h3Rgbm(textureSampleLevel(envBlur,  envSamp, uv, 0.0));",
    "  return mix(a, b, saturate(rough)) * u.envCfg.z;",
    "}"
  ].join("\n");

  /* 환경맵을 쓸 때만 uniform 구조체에 붙는 필드. */
  var ENV_FIELDS = [
    ["envCfg",  "vec3f"],   // x=RGBM 곱수 y=회전(라디안) z=세기
    ["envLo",   "vec3f"],   // 어두운 쪽 색조
    ["envMid",  "vec3f"],   // 중간 — 컨셉트 컬러가 들어가는 자리
    ["envHi",   "vec3f"],   // 밝은 쪽 — 보통 흰색에 가깝게
    ["envTint", "vec3f"],   // x=세기(0이면 끔) y=중간↔밝음 전환점 z=평균휘도
    ["gelCol",  "vec3f"],
    ["gelCfg",  "vec3f"]    // x=방위각 y=지수(클수록 가늚) z=세기(0이면 끔)
  ];

  /* ── 엔진 프렐류드 ────────────────────────────────────────
     저자 블록보다 앞에 붙지만, WGSL 은 선언 순서를 안 따지므로 softShadow
     가 뒤에 오는 map() 을 그냥 부릅니다. GLSL 시절의 전방 선언이
     필요 없어졌습니다. */
  var PRELUDE = [
    "fn rot2(a: f32) -> mat2x2f { let s = sin(a); let c = cos(a); return mat2x2f(c, -s, s, c); }",
    "",
    /* 부드러운 그림자.
       shadeSurface 안에서 불리므로 **표본마다** 도는 비용입니다. 심도를
       켜면 표본이 4~6배가 되니 여기서 아낀 반복이 그대로 곱해집니다.
       16 회와 26 회의 눈에 보이는 차이는 거의 없습니다. */
    "fn softShadow(ro: vec3f, rd: vec3f) -> f32 {",
    "  var res = 1.0; var t = 0.05;",
    "  for (var i = 0; i < 16; i = i + 1) {",
    "    let h = map(ro + rd * t);",
    "    res = min(res, 10.0 * h / t);",
    "    t = t + clamp(h, 0.035, 0.45);",
    "    if (res < 0.01 || t > 6.0) { break; }",
    "  }",
    "  return saturate(res);",
    "}"
  ].join("\n");

  /* 저자가 안 쓰면 이 기본값이 들어갑니다. GLSL 의 #ifndef 를 대신합니다 —
     WGSL 에는 전처리기가 없어서 저자 소스를 문자열로 살핍니다. */
  var OPTIONAL = [
    ["background",   "fn background(uv: vec2f) -> vec3f { return vec3f(0.0); }"],
    ["cameraOrigin", "fn cameraOrigin() -> vec3f { return u.cam; }"],
    ["cameraFov",    "fn cameraFov() -> f32 { return 1.45; }"],
    ["postProcess",  "fn postProcess(c: vec3f, uv: vec2f) -> vec3f { return c; }"]
  ];

  /* ── 엔진 에필로그 ────────────────────────────────────────
     map() 과 shadeSurface() 를 씁니다. */
  var EPILOGUE = [
    "fn h3Normal(p: vec3f) -> vec3f {",
    "  let e = vec2f(0.0011, 0.0);",
    "  return safeNormalize3(vec3f(map(p + e.xyy) - map(p - e.xyy),",
    "                              map(p + e.yxy) - map(p - e.yxy),",
    "                              map(p + e.yyx) - map(p - e.yyx)),",
    "                        vec3f(0.0, 1.0, 0.0));",
    "}",
    "",
    "fn h3Ao(p: vec3f, n: vec3f) -> f32 {",
    "  var s = 0.0; var w = 1.0;",
    "  for (var i = 1; i <= 5; i = i + 1) {",
    "    let d = 0.05 * f32(i);",
    "    s = s + w * (d - map(p + n * d));",
    "    w = w * 0.76;",
    "  }",
    "  return saturate(1.0 - 2.8 * s);",
    "}",
    "",
    "struct RayHit { col: vec3f, t: f32 }",
    "",
    /* 한 레이의 추적과 음영.
       톤매핑을 **여기서** 끝내고 압축된 값을 평균냅니다. HDR 상태로
       평균내면 아주 밝은 표본 하나가 픽셀 전체를 하얗게 끌고 가서
       가는 하이라이트 가장자리가 딱딱하게 남습니다. */
    "fn h3ShadeRay(ro: vec3f, rd: vec3f, uv: vec2f) -> RayHit {",
    "  var t = 0.0; var closest = 1e9; var tClose = 0.0;",
    "  var hit = false;",
    "  for (var i = 0; i < 88; i = i + 1) {",
    "    let p = ro + rd * t;",
    "    let d = map(p);",
    "    if (t > 0.02) { let r = d / t; if (r < closest) { closest = r; tClose = t; } }",
    "    if (d < 0.0011) { hit = true; break; }",
    "    t = t + d * 0.90;",
    "    if (t > 16.0) { break; }",
    "  }",
    /* 실루엣 커버리지: 빗나갔어도 픽셀 하나의 각도보다 가깝게 스쳤으면
       그 지점에서 음영을 내고 감쇠시킵니다. 바깥 윤곽이 부드러워집니다. */
    "  let px = 1.45 / u.res.y;",
    "  var cov = 1.0;",
    "  if (!hit && closest < px * 2.0) {",
    "    hit = true; t = tClose;",
    "    cov = 1.0 - smoothstep(0.0, px * 2.0, closest);",
    "  }",
    "  var col: vec3f;",
    "  if (hit) {",
    "    let p = ro + rd * t;",
    "    let n = h3Normal(p);",
    "    let occ = h3Ao(p, n);",
    "    let fres = pow(1.0 - saturate(dot(n, -rd)), 5.0);",
    "    col = shadeSurface(p, n, rd, occ, fres) * cov;",
    "  } else {",
    "    col = background(uv);",
    "  }",
    /* 빗나간 레이는 깊이를 멀리 밀어 둡니다 — 실루엣에서 fwidth 가
       크게 튀어 가장자리 판정이 됩니다. */
    "  return RayHit(tonemapAces(col), select(40.0, t, hit));",
    "}",
    "",
    /* 흐림용 저비용 추적.
       심도 표본은 어차피 평균되어 뭉개지므로 88 스텝까지 정밀할 이유가
       없습니다. 스텝을 절반으로 줄이고 실루엣 커버리지도 생략합니다 —
       이 하나로 심도가 켜진 화면이 두 배 빨라집니다. */
    "fn h3ShadeRayFast(ro: vec3f, rd: vec3f, uv: vec2f) -> vec3f {",
    "  var t = 0.0; var hit = false;",
    "  for (var i = 0; i < 44; i = i + 1) {",
    "    let d = map(ro + rd * t);",
    "    if (d < 0.0035) { hit = true; break; }",
    "    t = t + d * 0.93;",
    "    if (t > 16.0) { break; }",
    "  }",
    "  var col: vec3f;",
    "  if (hit) {",
    "    let p = ro + rd * t;",
    "    let n = h3Normal(p);",
    "    let occ = h3Ao(p, n);",
    "    let fres = pow(1.0 - saturate(dot(n, -rd)), 5.0);",
    "    col = shadeSurface(p, n, rd, occ, fres);",
    "  } else {",
    "    col = background(uv);",
    "  }",
    "  return tonemapAces(col);",
    "}",
    "",
    "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {",
    "  return fullscreenTriangleClip(i);",
    "}",
    "",
    "@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {",
    /* WebGPU 의 @builtin(position) 은 y 가 아래로 자랍니다. 셰이더 관습
       (Shadertoy·WebGL)은 위로 자라므로 **여기서 한 번만** 뒤집습니다.
       셰이더 안에서 또 뒤집지 마십시오. */
    "  let fragUp = vec2f(frag.x, u.res.y - frag.y);",
    "  let uv = (fragUp - 0.5 * u.res) / u.res.y;",
    "  let ro = cameraOrigin();",
    "  let fov = cameraFov();",
    /* ── 안티앨리어싱: 가장자리 적응형 4중 슈퍼샘플링 ──────────
       커버리지 보정만으로는 바깥 실루엣밖에 못 잡습니다. 형체끼리
       겹치는 **안쪽 경계**에서는 두 레이 모두 표면에 맞아 커버리지가
       1.0 이라 보정이 걸리지 않습니다.

       그렇다고 전 픽셀을 4중 샘플링하면 2880x1800 에서 19fps 로
       떨어집니다. 그래서 먼저 한 번 쏘고, 깊이가 급변하는 픽셀에서만
       세 번 더 쏩니다. 같은 품질에 3배 이상 빠릅니다(측정: 19 → 62fps).

       fwidth 는 분기 **밖에서** 계산해야 합니다. 갈라진 흐름 안에서는
       값이 정의되지 않습니다. WGSL 에서는 이것이 균일성 규칙으로
       강제되어, 분기 안에 두면 아예 컴파일이 실패합니다.

       회전 격자를 쓰는 이유: 정사각 격자는 거의 수평·수직인 경계에서
       사실상 2단계 계조밖에 못 만듭니다. */
    "  let rd0 = normalize(vec3f(uv, fov));",
    "  let hit0 = h3ShadeRay(ro, rd0, uv);",
    "  let c0 = hit0.col;",
    "  let t0 = hit0.t;",
    "  let edge = fwidth(t0);",
    /* 깊이만으로는 **안쪽 면 경계**를 놓칩니다. 다면체 유리에서 두 면이
       만나는 줄은 깊이가 연속이라 fwidth(t0) 가 0 에 가깝지만, 법선이
       꺾이면서 굴절 방향이 튀어 색은 확 바뀝니다 — 거기가 계단으로 남습니다.

       그래서 **보이는 것**을 직접 잽니다. c0 는 이미 계산해 둔 값이라
       추적이 늘지 않습니다. 부드러운 그라디언트는 픽셀당 0.002 수준이고
       진짜 경계는 0.3 을 넘으므로 0.055 로 갈라집니다. */
    "  let lumEdge = fwidth(luminance(c0));",
    /* 착란원(CoC) — 초점면에서 벗어난 정도. 이게 크면 흐려야 합니다.

       빗나간 레이는 깊이가 40 입니다(실루엣 판정용). 그대로 두면 **빈 배경
       전체가 "초점에서 한참 벗어남"으로 판정되어** 화면 대부분이 최고
       표본 수를 돌게 됩니다 — 이것 하나로 22fps 에 묶여 있었습니다.
       배경은 부드러운 그라디언트라 흐릴 것이 없습니다. */
    "  var coc = 0.0;",
    "  if (t0 <= 39.0) { coc = u.aperture * abs(t0 - u.focus) / max(t0, 0.001); }",
    /* 표본 수를 필요한 만큼만 씁니다.
       초점 안 + 평면 = 1개, 가장자리 = 4개, 초점 밖 = 6개.
       흐림이 셀수록 표본을 늘립니다. 약한 흐림에 6개를 쓰면 값만
       비싸지고 눈에 띄는 차이가 없습니다. */
    "  var n = 1;",
    "  if (coc > 0.022) { n = 6; }",
    "  else if (coc > 0.008) { n = 4; }",
    "  else if (edge > 0.045 || lumEdge > 0.055) { n = 4; }",
    "",
    "  var col = c0;",
    "  if (n > 1) {",
    "    let px = vec2f(1.0 / u.res.y);",
    /* 색수차는 **채널별 가중치**로 냅니다. 채널마다 따로 추적하면 표본
       하나가 3번이 되어 픽셀당 30번까지 갑니다 — 실제로 4fps 로 떨어졌습니다.
       바깥 표본을 R 쪽에, 안쪽 표본을 B 쪽에 더 실으면 추적 한 번으로
       가로 프린징과 같은 모양이 나옵니다. */
    "    var acc = c0;",
    "    var wsum = vec3f(1.0);",
    "    for (var i = 1; i < 6; i = i + 1) {",
    "      if (i >= n) { break; }",
    "      let fi = f32(i);",
    /* 황금각 원판 — 표본이 고르게 퍼져 보케에 줄무늬가 생기지 않습니다. */
    "      let rr = sqrt((fi + 0.5) / f32(n));",
    "      let aa = fi * goldenAngle + u.seed * tau;",
    "      let disc = vec2f(cos(aa), sin(aa)) * rr;",
    /* 초점 안에서는 픽셀 안 미세 지터(안티앨리어싱), 초점 밖에서는
       조리개 위 흩뿌리기(피사계 심도). 같은 표본이 두 일을 겸합니다.

       **지터는 uv 에서 겁니다.** 예전에는 uv 단위로 만든 값을 월드 방향
       벡터(길이 uFocus)에 더했습니다 — 단위가 달라서, focus 가 5 면
       실제로 움직인 각도가 한 픽셀의 1/6 이었습니다. 표본 넷이 같은 자리에
       겹쳐 계조가 아예 생기지 않았고, 바깥 실루엣은 커버리지 보정이
       가려 주는 바람에 **안쪽 면 경계에서만** 계단으로 남았습니다.

       지터한 uv 로 주광선을 다시 만들고, 그 광선이 초점면에서 만나는 점을
       겨눕니다. 얇은 렌즈 모형이 그대로 유지됩니다. */
    "      let uv2 = uv + disc * px * 0.5;",
    "      let focal2 = ro + normalize(vec3f(uv2, fov)) * u.focus;",
    "      let lens = disc * coc * 1.6;",
    "      let ro2 = ro + vec3f(lens, 0.0);",
    "      let rd2 = normalize(focal2 - ro2);",
    /* 초점이 걸린 픽셀에서만 저비용 추적을 씁니다. 순수 안티앨리어싱
       표본(coc≈0)은 실루엣 정밀도가 필요하므로 정식 추적입니다. */
    "      var s: vec3f;",
    "      if (coc > 0.008) { s = h3ShadeRayFast(ro2, rd2, uv); }",
    "      else { s = h3ShadeRay(ro2, rd2, uv).col; }",
    "      let k = u.chroma * (rr - 0.55) * 0.9;",
    "      let w = vec3f(1.0 + k, 1.0, 1.0 - k);",
    "      acc = acc + s * w; wsum = wsum + w;",
    "    }",
    "    col = acc / wsum;",
    "  }",
    "",
    "  col = postProcess(col, uv);",
    /* 비네팅 — 가장자리를 눌러 시선을 가운데로 모읍니다. 밝은 지면에서도
       같은 방향으로 걸어야 렌즈처럼 읽힙니다. */
    "  if (u.vignette > 0.0001) {",
    "    let v = 1.0 - smoothstep(0.35, 1.15, length(uv * vec2f(0.92, 1.0)));",
    "    col = col * mix(1.0 - u.vignette, 1.0, v);",
    "  }",
    /* 필름 그레인 — 매끈한 그라디언트의 '싼 티'를 걷어냅니다.
       GLSL 시절의 fract(sin(dot(...))) 대신 wgsl-std 의 정수 해시를 씁니다.
       드라이버마다 값이 갈리지 않고 주기가 짧지 않습니다. */
    "  if (u.grain > 0.0001) {",
    "    let g = hash2(fragUp + u.seed).x;",
    "    col = col + (g - 0.5) * u.grain;",
    "  }",
    /* 디더 — 어두운 그라디언트에서 띠가 생기는 걸 막습니다. */
    "  let dz = hash2(fragUp * 1.37).y;",
    "  col = col + (dz - 0.5) / 255.0;",
    "  return vec4f(col, 1.0);",
    "}"
  ].join("\n");

  /* ── 공유 디바이스 ────────────────────────────────────────
     WebGPU 는 WebGL 과 달리 컨텍스트 상한이 없습니다. GPUDevice 하나로
     캔버스 여러 장을 configure() 할 수 있어서, 화면 밖 캔버스에 그린 뒤
     2D 로 복사하던 배관이 통째로 사라졌습니다. 원점 뒤집기도 함께
     없어졌습니다 — 이제 각 캔버스가 직접 스왑체인을 갖습니다. */
  var _devicePromise = null;

  function getDevice() {
    if (_devicePromise) return _devicePromise;
    _devicePromise = (async function () {
      if (!global.navigator || !navigator.gpu) {
        throw new Error("이 브라우저는 WebGPU 를 지원하지 않습니다.\n" +
          "Chrome 113+, Safari 26+, Firefox 141+(Windows)·145+(macOS) 에서 열어 주십시오.");
      }
      var adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("GPU 어댑터를 얻지 못했습니다.");
      var device = await adapter.requestDevice();
      device.lost.then(function (info) {
        console.error("[3d-motion-web] device lost:", info.reason, info.message);
        _lost = true;
      });
      return device;
    })();
    return _devicePromise;
  }
  var _lost = false;

  function showError(host, msg) {
    var el = document.createElement("div");
    el.setAttribute("data-motionweb-error", "");
    el.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;" +
      "padding:1.5rem;text-align:center;background:#1a1012;color:#ff9b8a;" +
      "font:12px/1.7 ui-monospace,Menlo,monospace;white-space:pre-wrap;z-index:2";
    el.textContent = msg;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(el);
  }

  /* uniform 값을 구조체 레이아웃에 맞춰 Float32Array 에 씁니다. */
  function packUniforms(buf, slots, values) {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var v = values[s.name];
      if (v === undefined) continue;
      var base = s.offset / 4;
      if (s.kind === "array") {
        for (var r = 0; r < s.count; r++) {
          var row = v[r] || [];
          for (var c = 0; c < 4; c++) buf[base + r * 4 + c] = row[c] || 0;
        }
      } else if (s.kind === "f32") {
        buf[base] = typeof v === "number" ? v : (v[0] || 0);
      } else {
        for (var k = 0; k < s.lanes; k++) buf[base + k] = v[k] || 0;
      }
    }
  }

  /*
   * assemble(opts) -> { code, layout }
   *
   * 저자 블록과 엔진 조각을 WGSL 한 장으로 조립합니다. **GPU 가 필요 없습니다** —
   * scripts/check-shader.mjs 가 이것을 불러 `vgpu check` 에 물립니다.
   * 브라우저를 열기 전에 셰이더 오류를 잡는 자리입니다.
   */
  function assemble(opts) {
    var env = opts.envMap || null;
    var uniforms = Object.assign({}, opts.uniforms || {});

    /* 환경맵을 쓰면 uniform 구조체에 env 필드가 붙습니다. 안 쓰면 아예
       선언되지 않으므로 버퍼도 그만큼 작습니다. */
    var fields = env ? ENGINE_FIELDS.concat(ENV_FIELDS) : ENGINE_FIELDS;
    var layout = buildUniformStruct(fields, uniforms);

    /* hg_sdf 를 인라인해 두었으면 자동으로 집어넣습니다. 별도 파일로 둔
       것은 MIT 고지가 그 코드에 붙어 있어야 하기 때문입니다 — 쓰지 않는
       지면은 스크립트를 빼면 그만입니다. `include` 로 직접 넘겨도 됩니다. */
    var extra = [];
    if (opts.include) extra.push([].concat(opts.include).join("\n"));
    else if (global.HG_SDF_WGSL) extra.push(global.HG_SDF_WGSL);

    /* 저자가 정의하지 않은 선택 함수만 기본 구현을 붙입니다.
       GLSL 의 #ifndef HAS_* 를 대신합니다 — WGSL 에는 전처리기가 없습니다. */
    var body = opts.fragment || "";
    var defaults = OPTIONAL.filter(function (o) {
      return !new RegExp("fn\\s+" + o[0] + "\\s*\\(").test(body);
    }).map(function (o) { return o[1]; }).join("\n");

    /* wgsl-std 는 <script id="wgslstd" type="text/wgsl"> 에 인라인해 둡니다.
       옵션이나 전역으로 넘겨도 됩니다 — Node 검증 스크립트가 그 길을 씁니다. */
    var std = opts.wgslStd || global.MOTIONWEB_WGSL_STD;
    if (!std && typeof document !== "undefined") {
      var tag = document.getElementById("wgslstd");
      if (tag) std = tag.textContent;
    }
    if (!std) {
      throw new Error("assets/wgsl-std.wgsl 가 인라인되지 않았습니다.\n" +
        "<script id=\"wgslstd\" type=\"text/wgsl\"> 에 그 파일 내용을 넣으십시오.");
    }

    return {
      layout: layout,
      code: [
        std, layout.wgsl, env ? ENVMAP : "", PRELUDE,
        extra.join("\n"), body, defaults, EPILOGUE
      ].filter(Boolean).join("\n\n")
    };
  }

  /*
   * create(opts) -> Promise<handle>
   *
   *   **비동기입니다.** WebGPU 의 requestAdapter/requestDevice 가 Promise 라
   *   피할 수 없습니다. `await MotionWeb.create({...})` 로 부르십시오.
   *
   *   canvas      HTMLCanvasElement (필수)
   *   fragment    저자 WGSL 블록 — map() 과 shadeSurface() 를 포함 (필수)
   *   uniforms    {이름: 값} — `u.이름` 으로 들어갑니다
   *   seed        number (기본 3.7)
   *   frozenTime  prefers-reduced-motion 일 때 고정할 시각 (기본 6.0)
   *   camera      function(scroll, wide) -> [x, y, z]. 넘기면 u.cam 으로
   *               들어가고 cameraOrigin() 이 그것을 씁니다. **카메라 식이
   *               한 곳에만 있게 됩니다**
   *   lens.autoFocus  숫자를 주면 초점 = |카메라| − 그 값 으로 매 프레임
   *               다시 잡습니다. 초점이 형체를 놓치는 사고를 막습니다
   *   maxFps      프레임 상한 (기본 60)
   *   envMap      { sharp, blur, mult, mean, rotate, intensity, tint, gel }
   *               RGBM 등직사각 환경맵. scripts/hdri-to-envmap.py 가 mult 와
   *               mean 을 찍어 줍니다. 넘기면 셰이더에 envMap(dir, rough) ·
   *               envMapRaw(dir, rough) 가 생깁니다.
   *               **GLSL 시절의 1인자 envMap(dir) 은 없습니다** — WGSL 에
   *               함수 오버로드가 없습니다. rough 를 항상 넘기십시오
   *   include     추가 WGSL. 안 넘기면 인라인된 HG_SDF_WGSL 을 자동으로 씁니다
   *   onError     function(msg) — 없으면 캔버스 자리에 붉은 글로 띄웁니다
   *
   * 반환: Promise<{ setUniforms, setLens, setEnv, setSeed, pause, resume,
   *                 isRunning, redraw, scroll, camera, wide, stats, destroy }>
   */
  async function create(opts) {
    var canvas = opts.canvas;
    var host = canvas.parentElement || canvas;
    var device;
    try {
      device = await getDevice();
    } catch (e) {
      var m0 = String(e && e.message || e);
      opts.onError ? opts.onError(m0) : showError(host, m0);
      return null;
    }

    var env = opts.envMap || null;
    var uniforms = Object.assign({}, opts.uniforms || {});
    var seed = typeof opts.seed === "number" ? opts.seed : 3.7;
    var frozen = typeof opts.frozenTime === "number" ? opts.frozenTime : 6.0;

    /* 렌즈 기본값은 전부 꺼짐입니다 — 넘기지 않으면 심도도 비네팅도 없습니다. */
    var lens = Object.assign(
      { focus: 5.0, aperture: 0.0, vignette: 0.0, chroma: 0.0, grain: 0.0 },
      opts.lens || {});

    var built;
    try { built = assemble(opts); }
    catch (e) {
      var mA = String(e && e.message || e);
      opts.onError ? opts.onError(mA) : showError(host, mA);
      return null;
    }
    var code = built.code, layout = built.layout;

    var format = navigator.gpu.getPreferredCanvasFormat();
    var ctx = canvas.getContext("webgpu");
    if (!ctx) {
      var mCtx = "canvas.getContext('webgpu') 가 null 을 반환했습니다.";
      opts.onError ? opts.onError(mCtx) : showError(host, mCtx);
      return null;
    }
    ctx.configure({ device: device, format: format, alphaMode: "opaque" });

    /* 조용한 검은 화면이 가장 나쁩니다. 실패는 반드시 눈에 보여야 합니다.
       WebGPU 는 컴파일 오류를 예외로 던지지 않고 getCompilationInfo() 로
       내주므로, 직접 읽어서 띄우지 않으면 아무 일도 없었던 것처럼 넘어갑니다. */
    device.pushErrorScope("validation");
    var module = device.createShaderModule({ code: code, label: "motionweb" });
    var info = await module.getCompilationInfo();
    var errs = info.messages.filter(function (m) { return m.type === "error"; });
    if (errs.length) {
      await device.popErrorScope();
      var lines = code.split("\n");
      var m1 = "셰이더 컴파일 실패\n\n" + errs.slice(0, 6).map(function (m) {
        return m.lineNum + ":" + m.linePos + "  " + m.message +
               "\n    " + (lines[m.lineNum - 1] || "").trim();
      }).join("\n\n");
      console.error("[3d-motion-web]", m1);
      opts.onError ? opts.onError(m1) : showError(host, m1);
      return null;
    }

    var pipeline = device.createRenderPipeline({
      label: "motionweb",
      layout: "auto",
      vertex: { module: module, entryPoint: "vs" },
      fragment: { module: module, entryPoint: "fs", targets: [{ format: format }] },
      primitive: { topology: "triangle-list" }
    });
    var pErr = await device.popErrorScope();
    if (pErr) {
      var m2 = "파이프라인 생성 실패\n\n" + pErr.message;
      console.error("[3d-motion-web]", m2);
      opts.onError ? opts.onError(m2) : showError(host, m2);
      return null;
    }

    var ubo = device.createBuffer({
      label: "motionweb-uniforms",
      size: layout.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    var ubuf = new Float32Array(layout.size / 4);

    /* ── 환경맵 텍스처 ──────────────────────────────────────
       이미지 디코딩은 비동기입니다. 첫 프레임은 반드시 그려야 하므로
       1x1 중간 회색을 먼저 올리고, 도착하면 바꿔 끼우고 다시 그립니다.
       이것을 rAF 에 걸지 않는 이유는 숨겨진 문서에서 rAF 가 한 번도
       불리지 않기 때문입니다 — 그러면 환경이 영영 회색으로 남습니다. */
    var envTex = null, envSampler = null, bindGroup = null;

    function makeTexture(w, h) {
      return device.createTexture({
        size: [w, h], format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |
               GPUTextureUsage.RENDER_ATTACHMENT
      });
    }

    function rebuildBindGroup() {
      var entries = [{ binding: 0, resource: { buffer: ubo } }];
      if (env) {
        entries.push({ binding: 1, resource: envTex.sharp.createView() });
        entries.push({ binding: 2, resource: envTex.blur.createView() });
        entries.push({ binding: 3, resource: envSampler });
      }
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0), entries: entries });
    }

    if (env) {
      /* 가로는 이어 붙습니다(경도가 한 바퀴 돌아옵니다). 세로를 repeat 로
         두면 극에서 반대편이 새어 들어옵니다. */
      envSampler = device.createSampler({
        addressModeU: "repeat", addressModeV: "clamp-to-edge",
        magFilter: "linear", minFilter: "linear"
      });
      envTex = { sharp: makeTexture(1, 1), blur: makeTexture(1, 1) };
      ["sharp", "blur"].forEach(function (slot) {
        device.queue.writeTexture({ texture: envTex[slot] },
          new Uint8Array([190, 190, 190, 255]), { bytesPerRow: 4 }, [1, 1]);
      });
      ["sharp", "blur"].forEach(function (slot) {
        if (!env[slot]) return;
        (async function () {
          try {
            var res = await fetch(env[slot]);
            var bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none" });
            if (!alive) { bmp.close(); return; }
            envTex[slot].destroy();
            envTex[slot] = makeTexture(bmp.width, bmp.height);
            /* 뒤집지 않습니다. PNG 첫 행이 등직사각의 위쪽(+Y)이고
               envMap 의 v=0 도 위쪽입니다 — 뒤집으면 하늘이 바닥에 옵니다. */
            device.queue.copyExternalImageToTexture(
              { source: bmp, flipY: false },
              { texture: envTex[slot] }, [bmp.width, bmp.height]);
            bmp.close();
            rebuildBindGroup();
            draw(running ? (performance.now() - t0) / 1000 : frozen, performance.now());
          } catch (e) {
            console.error("[3d-motion-web] 환경맵을 읽지 못했습니다: " + slot, e);
          }
        })();
      });
    }
    rebuildBindGroup();

    /* 색조는 넘기지 않으면 꺼집니다 — 원본 HDRI 그대로 나옵니다.

       보통은 `tint: { color: [r,g,b] }` 하나면 됩니다. 나머지는 여기서
       파생합니다 — 아래 두 값이 이 문제의 답입니다.

       **어두운 쪽에도 액센트를 넣어야 합니다.** 검은 크롬이 실제로 보여
       주는 휘도 대역은 대부분 어두운 쪽입니다. 거기를 중성 회색으로 두면
       중간톤에만 색을 넣어 봐야 화면에 거의 안 나옵니다.

       **전환점은 높아야 합니다.** 흰색은 진짜 스페큘러 심지에만 남깁니다.
       낮으면 넓은 반사면까지 희어져 색이 다시 사라집니다. */
    var tint = (env && env.tint) || {};
    var base = tint.color || tint.mid || [1.0, 1.0, 1.0];
    var gel = (env && env.gel) || null;
    var envVals = !env ? {} : {
      envCfg: [env.mult || 1.0, env.rotate || 0.0,
               typeof env.intensity === "number" ? env.intensity : 1.0],
      envLo:  tint.lo || [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55],
      envMid: tint.mid || base,
      envHi:  tint.hi || [1.00, 0.97, 0.92],
      envTint: [
        typeof tint.amount === "number" ? tint.amount : (tint.color || tint.mid ? 1.0 : 0.0),
        typeof tint.pivot === "number" ? tint.pivot : 0.88,
        env.mean || 0.85
      ],
      /* 젤 색은 안 주면 색조와 같은 것을 씁니다 — 팔레트가 한 곳에서
         나와야 조명과 표면이 따로 놀지 않습니다. 방위각은 환경 회전과
         **따로 돕니다.** 스튜디오를 돌려도 이 조명은 제자리입니다. */
      gelCol: (gel && gel.color) || base,
      gelCfg: [
        gel && typeof gel.azimuth === "number" ? gel.azimuth : -2.35,
        gel && typeof gel.width === "number" ? gel.width : 46.0,
        gel ? (typeof gel.intensity === "number" ? gel.intensity : 26.0) : 0.0
      ]
    };

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* 스크롤 진행도.
       리스너 대신 매 프레임 읽습니다 — 스크롤 이벤트는 브라우저마다 빈도가
       달라 값이 튀는데, rAF 안에서 읽으면 항상 그 프레임의 진짜 값입니다.
       그리고 목표값으로 서서히 따라붙게 해 배경에 관성을 줍니다.

       rate 만으로는 빠른 스크롤을 잡지 못합니다 — 감쇠는 따라붙는 속도를
       늦출 뿐, 배경이 이동해야 할 총 거리를 줄이지 않습니다. maxRate 가
       **초당 진행도 변화**를 잘라, 아무리 빨리 스크롤해도 배경은 정해진
       속도로만 흐르고 멈춘 뒤 마저 따라옵니다. */
    var scr = Object.assign({ rate: 3.0, maxRate: 0.42 }, opts.scroll || {});
    var scrollSmooth = 0, scrollLast = 0;

    function readScroll(now) {
      var doc = document.documentElement;
      var max = Math.max(1, (doc.scrollHeight || 1) - window.innerHeight);
      var target = Math.max(0, Math.min(1, (window.scrollY || 0) / max));
      if (reduce) { scrollSmooth = target; return target; }
      /* 프레임당 고정 계수를 쓰면 프레임률이 흔들릴 때 따라붙는 속도까지
         흔들려 움직임이 고르지 않습니다. 지난 프레임의 실제 시간을 지수
         감쇠에 넣어 프레임률과 무관하게 만듭니다. */
      var dt = scrollLast ? Math.min(0.1, (now - scrollLast) / 1000) : 1 / 60;
      scrollLast = now;
      var step = (target - scrollSmooth) * (1 - Math.exp(-dt * scr.rate));
      var limit = scr.maxRate * dt;
      if (step > limit) step = limit; else if (step < -limit) step = -limit;
      scrollSmooth += step;
      return scrollSmooth;
    }

    var camFn = typeof opts.camera === "function" ? opts.camera : null;
    var camNow = [0, 0, -5], wideNow = 1;
    var running = !reduce, visible = true, alive = true;
    var t0 = performance.now(), rafId = 0;

    /* ── 프레임 상한 ────────────────────────────────────────
       **fps 는 부하 지표가 아닙니다.** 상한이 없으면 120Hz 화면에서 전체
       화면 레이마칭을 초당 120번 돌립니다 — 60번으로 충분한 배경에 GPU 를
       두 배로 태우는 것이라, 화면은 멀쩡한데 팬이 돌고 배터리가 닳습니다. */
    var maxFps = Math.max(15, Math.min(120, opts.maxFps || 60));
    var capMs = 1000 / maxFps - 1.2;   // 여유 1.2ms — vsync 경계에서 프레임을 흘리지 않게
    var lastDraw = -1e9;

    /* ── 적응형 해상도 ──────────────────────────────────────
       어느 GPU 에서 돌지 알 수 없습니다. 프레임 시간을 재서 느리면 백킹
       스토어를 줄이고, 여유가 생기면 되돌립니다. 레이마칭은 픽셀당 비용이라
       해상도를 낮추는 것이 가장 직접적인 레버입니다. */
    var scale = 1.0, frameAvg = 1000 / maxFps, frames = 0, lastT = 0, settle = 0;

    function measure(now) {
      frames++;
      var base2 = 1000 / maxFps;
      if (lastT) {
        var dt = now - lastT;
        if (dt < 200) frameAvg += (dt - frameAvg) * 0.1;   // 탭 복귀 튐 무시
      }
      lastT = now;
      if (++settle < 40) return;
      if (frameAvg > base2 + 4.3 && scale > 0.5) { scale = Math.max(0.5, scale - 0.15); settle = 0; }
      else if (frameAvg < base2 + 1.5 && scale < 1.0) { scale = Math.min(1.0, scale + 0.1); settle = 0; }
    }

    /* 백킹 스토어는 **물리 픽셀에 맞춥니다**. DPR 을 1.5 같은 값으로 묶으면
       레티나(2x)에서 네이티브보다 낮게 그린 뒤 브라우저가 늘리는 것이라,
       안티앨리어싱이 아니라 그냥 뭉개는 것이 됩니다. */
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      var r = canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
      return false;
    }

    function draw(t, nowMs) {
      if (!alive || _lost) return;
      var w = canvas.width, h = canvas.height;
      if (w < 2 || h < 2) return;

      /* 화면비를 0(아주 좁음)~1(넓음)로 정규화. 저자가 카메라·배치·스크림을
         이 값 하나로 함께 움직이면 반응형이 어긋나지 않습니다. */
      wideNow = Math.max(0, Math.min(1, ((w / h) - 0.50) / (1.60 - 0.50)));
      var sNow = readScroll(nowMs);
      if (camFn) {
        var c = camFn(sNow, wideNow);
        if (c && c.length === 3) camNow = c;
      }
      if (typeof lens.autoFocus === "number") {
        lens.focus = Math.sqrt(camNow[0] * camNow[0] + camNow[1] * camNow[1] +
                               camNow[2] * camNow[2]) - lens.autoFocus;
      }

      var vals = {
        res: [w, h], time: t, seed: seed, cam: camNow, wide: wideNow,
        /* 노이즈에 더할 오프셋. wgsl-std 의 perlin/simplex 는 시드를 받지
           않으므로 좌표를 옮겨서 씁니다 — 같은 시드면 같은 그림입니다. */
        noiseSeed: [seed * 31.7, seed * 17.3, seed * 11.9],
        scroll: sNow, focus: lens.focus, aperture: lens.aperture,
        vignette: lens.vignette, chroma: lens.chroma, grain: lens.grain
      };
      packUniforms(ubuf, layout.slots, vals);
      if (env) packUniforms(ubuf, layout.slots, envVals);
      packUniforms(ubuf, layout.slots, uniforms);
      device.queue.writeBuffer(ubo, 0, ubuf);

      var enc = device.createCommandEncoder();
      var pass = enc.beginRenderPass({
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store"
        }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    }

    /* 다음 프레임 예약을 **맨 위에서** 합니다. 아래에서 일찍 반환하는 길이
       둘(화면 밖 · 상한 미달)이라, 예약이 뒤에 있으면 그 길로 빠질 때
       루프가 통째로 멈춥니다. */
    function loop(now) {
      if (!alive) return;
      rafId = requestAnimationFrame(loop);
      if (!visible) return;
      if (now - lastDraw < capMs) return;
      lastDraw = now;
      measure(now);
      size();
      draw(running ? (now - t0) / 1000 : frozen, now);
    }

    /* 초기화를 rAF 안에 넣지 않습니다. 문서가 숨겨진 채로 열리면
       requestAnimationFrame 이 한 번도 불리지 않아 캔버스가 영영
       사이즈되지 않습니다 — 백그라운드 탭에서 그대로 빈 화면이 됩니다.
       실제로 스파이크에서 이 증상을 다시 확인했습니다. */
    size();
    draw(reduce ? frozen : 0, performance.now());

    /* 폭이 0 에서 실제 값으로 바뀌는 순간을 잡습니다. 숨겨진 채 열렸다가
       나중에 보이게 되는 경우가 여기로 들어옵니다. */
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (!alive) return;
        size();
        draw(running ? (performance.now() - t0) / 1000 : frozen, performance.now());
      });
      ro.observe(canvas);
    }

    /* 화면 밖 배경은 그리지 않습니다. */
    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { visible = e.isIntersecting; });
      }, { rootMargin: "150px" });
      io.observe(canvas);
    }

    rafId = requestAnimationFrame(loop);

    return {
      setUniforms: function (o) { Object.assign(uniforms, o); },
      setLens: function (o) { Object.assign(lens, o); },
      /* 환경을 나중에 바꿉니다 — 회전·세기·색조. 스크롤에 따라 조명이
         돌아가는 연출이 여기서 나옵니다. */
      setEnv: function (o) {
        if (!env || !o) return;
        if (typeof o.rotate === "number") envVals.envCfg[1] = o.rotate;
        if (typeof o.intensity === "number") envVals.envCfg[2] = o.intensity;
        if (o.tint) {
          if (o.tint.lo) envVals.envLo = o.tint.lo;
          if (o.tint.mid) envVals.envMid = o.tint.mid;
          if (o.tint.hi) envVals.envHi = o.tint.hi;
          if (typeof o.tint.amount === "number") envVals.envTint[0] = o.tint.amount;
          if (typeof o.tint.pivot === "number") envVals.envTint[1] = o.tint.pivot;
        }
        if (o.gel) {
          if (o.gel.color) envVals.gelCol = o.gel.color;
          if (typeof o.gel.azimuth === "number") envVals.gelCfg[0] = o.gel.azimuth;
          if (typeof o.gel.width === "number") envVals.gelCfg[1] = o.gel.width;
          if (typeof o.gel.intensity === "number") envVals.gelCfg[2] = o.gel.intensity;
        }
      },
      setSeed: function (n) { seed = n; },
      pause: function () { running = false; },
      resume: function () {
        if (reduce) return;
        if (!running) { t0 = performance.now(); running = true; }
      },
      isRunning: function () { return running; },
      /* 한 프레임을 지금 그립니다. `t` 를 주면 그 시각으로 그립니다. */
      redraw: function (t) {
        size();
        draw(typeof t === "number" ? t
             : (running ? (performance.now() - t0) / 1000 : frozen), performance.now());
      },
      /* 페이지 쪽 스크롤 값이 배경과 어긋나지 않게 같은 값을 씁니다. */
      scroll: function () { return scrollSmooth; },
      /* 지금 카메라가 있는 자리와 화면비. 지면 쪽에서 같은 식을 다시
         쓰지 않게 하려는 것입니다. */
      camera: function () { return camNow.slice(); },
      wide: function () { return wideNow; },
      /* 진단용 — 게이트에서 실측할 때 씁니다.
         fps 가 상한에 붙어 있으면 "빠르다"가 아니라 "여유가 있다"는 뜻입니다. */
      stats: function () {
        return {
          fps: Math.round(1000 / frameAvg), maxFps: maxFps,
          scale: Math.round(scale * 100) / 100,
          pixels: canvas.width + "x" + canvas.height,
          frames: frames, uniformBytes: layout.size,
          shaderBytes: code.length
        };
      },
      /* 진단용 — 조립된 WGSL 전문. vgpu check 에 물릴 때 씁니다. */
      wgsl: function () { return code; },
      destroy: function () {
        alive = false;
        cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        ubo.destroy();
        if (envTex) { envTex.sharp.destroy(); envTex.blur.destroy(); }
      }
    };
  }

  global.MotionWeb = { create: create, assemble: assemble };
})(typeof window !== "undefined" ? window : globalThis);

// 동적 import 로 불러오도록 ES 모듈로 둔다. 위 IIFE 가 window.MotionWeb 을 정의한다.
export {};
