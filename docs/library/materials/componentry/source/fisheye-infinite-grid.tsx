"use client";

import { cn } from "@workspace/ui/lib/utils";
import {
  type CSSProperties,
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

export interface FisheyeGridItem {
  /** Image displayed inside the tile. */
  image: string;
  /** Accessible description for the image. */
  alt: string;
  /** Primary tile label. */
  title?: string;
  /** Secondary tile label, such as a year or category. */
  meta?: string;
}

export interface FisheyeInfiniteGridProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Items repeated across the infinite field. */
  items?: FisheyeGridItem[];
  /** Width of each tile in CSS pixels. */
  tileWidth?: number;
  /** Height of each tile in CSS pixels. */
  tileHeight?: number;
  /** Space between tiles in CSS pixels. */
  gap?: number;
  /** Strength of the lens warp. Set to 0 for a flat grid. */
  lensStrength?: number;
  /** Visual treatment for the grid surface and tile chrome. */
  theme?: "dark" | "light" | "system";
  /** Distance of the subtle ambient hover drift in CSS pixels. */
  hoverNudge?: number;
  /** Momentum retained after releasing a drag, from 0 to 1. */
  inertia?: number;
  /** Amount of movement produced by trackpad or mouse-wheel input. */
  wheelSensitivity?: number;
  /** Additional classes applied to the root container. */
  className?: string;
}

export const FISHEYE_GRID_ITEMS: FisheyeGridItem[] = [
  {
    image:
      "https://images.unsplash.com/photo-1514906689926-25ba6dcb584b?w=900&q=85&auto=format&fit=crop",
    alt: "Soft motion-blurred portrait in pale light",
    title: "Silver Veil",
    meta: "01",
  },
  {
    image:
      "https://images.unsplash.com/photo-1527630941-4a229fd674ab?w=900&q=85&auto=format&fit=crop",
    alt: "Seated figure softened by vertical motion blur",
    title: "Quiet Frame",
    meta: "02",
  },
  {
    image:
      "https://images.unsplash.com/photo-1568557412756-7d219873dd11?w=900&q=85&auto=format&fit=crop",
    alt: "Figures moving through saturated orange light",
    title: "Ember Transit",
    meta: "03",
  },
  {
    image:
      "https://images.unsplash.com/photo-1581892805885-73bdd91beff0?w=900&q=85&auto=format&fit=crop",
    alt: "Monochrome portrait obscured by a moving hand",
    title: "Soft Gesture",
    meta: "04",
  },
  {
    image:
      "https://images.unsplash.com/photo-1603786420263-ad59136a7409?w=900&q=85&auto=format&fit=crop",
    alt: "Face stretched into warm horizontal motion",
    title: "Amber Echo",
    meta: "05",
  },
  {
    image:
      "https://images.unsplash.com/photo-1610846202780-b4d9837371ea?w=900&q=85&auto=format&fit=crop",
    alt: "Lone figure passing through a muted green field",
    title: "Moss Passage",
    meta: "06",
  },
  {
    image:
      "https://images.unsplash.com/photo-1612592046138-1514dc06a1cd?w=900&q=85&auto=format&fit=crop",
    alt: "Figure dissolving into cyan camera movement",
    title: "Cyan Current",
    meta: "07",
  },
  {
    image:
      "https://images.unsplash.com/photo-1617281822114-9541b921a880?w=900&q=85&auto=format&fit=crop",
    alt: "Dancers trailing across a dark stage",
    title: "Phantom Chorus",
    meta: "08",
  },
  {
    image:
      "https://images.unsplash.com/photo-1619122656350-bde66c98e6a4?w=900&q=85&auto=format&fit=crop",
    alt: "Soft figure receding into a warm cream background",
    title: "Ivory Fade",
    meta: "09",
  },
  {
    image:
      "https://images.unsplash.com/photo-1624344965194-6aa6729ad832?w=900&q=85&auto=format&fit=crop",
    alt: "Editorial portrait doubled in red and cyan light",
    title: "Ionic Profile",
    meta: "10",
  },
  {
    image:
      "https://images.unsplash.com/photo-1633382148761-d56d55cee3cd?w=900&q=85&auto=format&fit=crop",
    alt: "Monochrome portrait with hair caught in motion",
    title: "Carbon Study",
    meta: "11",
  },
  {
    image:
      "https://images.unsplash.com/photo-1542320868-497d7aeaaa13?w=900&q=85&auto=format&fit=crop",
    alt: "Pale flowers swept across a black background",
    title: "Petal Trace",
    meta: "12",
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_atlas_size;
  uniform vec2 u_offset;
  uniform float u_curvature;
  varying vec2 v_uv;

  void main() {
    vec2 centered = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 lens = vec2(centered.x * aspect, centered.y);
    float radius = dot(lens, lens) / (aspect * aspect + 1.0);
    float curve = u_curvature * (0.34 * radius + 0.12 * radius * radius);
    vec2 warped = lens / (1.0 + curve);
    vec2 warped_uv = vec2(warped.x / aspect, warped.y) * 0.5 + 0.5;
    vec2 world = vec2(
      warped_uv.x * u_resolution.x - u_offset.x,
      (1.0 - warped_uv.y) * u_resolution.y - u_offset.y
    );
    vec2 atlas_uv = fract(world / u_atlas_size);
    vec4 color = texture2D(u_texture, vec2(atlas_uv.x, 1.0 - atlas_uv.y));
    float edgeShade = clamp(radius * u_curvature * 0.12, 0.0, 0.24);
    color.rgb *= 1.0 - edgeShade;
    gl_FragColor = color;
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

export function FisheyeInfiniteGrid({
  items = FISHEYE_GRID_ITEMS,
  tileWidth = 238,
  tileHeight = 272,
  gap = 0,
  lensStrength = 0.24,
  theme = "system",
  hoverNudge = 16,
  inertia = 0.94,
  wheelSensitivity = 0.42,
  className,
  style,
  "aria-label": ariaLabel = "Infinite draggable image grid",
  ...rest
}: FisheyeInfiniteGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    x: 0,
    y: 0,
    time: 0,
  });
  const nudgeRef = useRef<{
    startedAt: number;
    x: number;
    y: number;
  } | null>(null);
  const reducedMotionRef = useRef(false);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(
    theme === "light" ? "light" : "dark",
  );
  const resolvedItems = items.length > 0 ? items : FISHEYE_GRID_ITEMS;

  useEffect(() => {
    if (theme !== "system") {
      setResolvedTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const resolveSystemTheme = () => {
      const root = document.documentElement;
      setResolvedTheme(
        root.classList.contains("dark") ||
          (!root.classList.contains("light") && mediaQuery.matches)
          ? "dark"
          : "light",
      );
    };
    const observer = new MutationObserver(resolveSystemTheme);

    resolveSystemTheme();
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    mediaQuery.addEventListener("change", resolveSystemTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", resolveSystemTheme);
    };
  }, [theme]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    const positionBuffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!positionBuffer || !texture) return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const atlasSizeLocation = gl.getUniformLocation(program, "u_atlas_size");
    const offsetLocation = gl.getUniformLocation(program, "u_offset");
    const curvatureLocation = gl.getUniformLocation(program, "u_curvature");
    const textureLocation = gl.getUniformLocation(program, "u_texture");

    const safeTileWidth = Math.max(140, tileWidth);
    const safeTileHeight = Math.max(150, tileHeight);
    const safeGap = Math.max(0, gap);
    const cellWidth = safeTileWidth + safeGap;
    const cellHeight = safeTileHeight + safeGap;
    const atlasColumns = Math.max(2, Math.min(4, resolvedItems.length));
    const atlasRows = Math.max(
      2,
      Math.ceil(resolvedItems.length / atlasColumns),
    );
    const atlas = document.createElement("canvas");
    atlas.width = Math.ceil(atlasColumns * cellWidth);
    atlas.height = Math.ceil(atlasRows * cellHeight);
    const atlasContext = atlas.getContext("2d");
    if (!atlasContext) return;

    const loadedImages: Array<HTMLImageElement | null> = Array.from(
      { length: resolvedItems.length },
      () => null,
    );
    let disposed = false;
    let animationFrame = 0;
    let previousFrame = performance.now();
    let viewWidth = 1;
    let viewHeight = 1;

    const uploadAtlas = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlas,
      );
    };

    const drawAtlas = () => {
      const light = resolvedTheme === "light";
      atlasContext.fillStyle = light ? "#f1efe9" : "#060606";
      atlasContext.fillRect(0, 0, atlas.width, atlas.height);
      atlasContext.textBaseline = "middle";

      for (let index = 0; index < atlasColumns * atlasRows; index += 1) {
        const item = resolvedItems[index % resolvedItems.length]!;
        const image = loadedImages[index % resolvedItems.length];
        const column = index % atlasColumns;
        const row = Math.floor(index / atlasColumns);
        const x = column * cellWidth;
        const y = row * cellHeight;
        const inset = Math.max(12, Math.round(safeTileWidth * 0.07));
        const footerHeight = Math.max(32, Math.round(safeTileHeight * 0.14));
        const imageWidth = safeTileWidth - inset * 2;
        const imageHeight = safeTileHeight - inset * 2 - footerHeight;

        atlasContext.fillStyle = light ? "#f8f6f0" : "#080808";
        atlasContext.fillRect(x, y, safeTileWidth, safeTileHeight);
        atlasContext.strokeStyle = light
          ? "rgba(0,0,0,0.12)"
          : "rgba(255,255,255,0.09)";
        atlasContext.lineWidth = 1;
        atlasContext.beginPath();
        atlasContext.moveTo(x + 0.5, y);
        atlasContext.lineTo(x + 0.5, y + safeTileHeight);
        atlasContext.moveTo(x, y + 0.5);
        atlasContext.lineTo(x + safeTileWidth, y + 0.5);
        atlasContext.stroke();

        atlasContext.fillStyle = light
          ? "rgba(0,0,0,0.04)"
          : "rgba(255,255,255,0.035)";
        atlasContext.fillRect(x + inset, y + inset, imageWidth, imageHeight);
        if (image?.complete && image.naturalWidth > 0) {
          drawCoverImage(
            atlasContext,
            image,
            x + inset,
            y + inset,
            imageWidth,
            imageHeight,
          );
          atlasContext.fillStyle = light
            ? "rgba(0,0,0,0.08)"
            : "rgba(0,0,0,0.22)";
          atlasContext.fillRect(x + inset, y + inset, imageWidth, imageHeight);
        }

        atlasContext.strokeStyle = light
          ? "rgba(0,0,0,0.1)"
          : "rgba(255,255,255,0.1)";
        atlasContext.strokeRect(
          x + inset + 0.5,
          y + inset + 0.5,
          imageWidth - 1,
          imageHeight - 1,
        );

        const labelY = y + safeTileHeight - inset - footerHeight / 2 + 5;
        const fontSize = Math.max(8, Math.round(safeTileWidth * 0.038));
        atlasContext.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        atlasContext.fillStyle = light
          ? "rgba(0,0,0,0.5)"
          : "rgba(255,255,255,0.48)";
        const title = (item.title ?? item.alt).toUpperCase();
        atlasContext.fillText(
          title.length > 18 ? `${title.slice(0, 17)}…` : title,
          x + inset,
          labelY,
        );
        if (item.meta) {
          atlasContext.textAlign = "right";
          atlasContext.fillText(item.meta, x + safeTileWidth - inset, labelY);
          atlasContext.textAlign = "left";
        }
      }

      uploadAtlas();
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery.matches;
    };
    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);

    const safeInertia = clamp(inertia, 0, 0.98);

    const currentNudge = (time: number) => {
      const nudge = nudgeRef.current;
      if (!nudge) return { x: 0, y: 0, active: false };

      const elapsed = Math.max(0, time - nudge.startedAt);
      const progress = clamp(elapsed / 520, 0, 1);
      const settled = 1 - Math.pow(1 - progress, 3);
      const breathing = 1 + Math.sin(elapsed * 0.0042) * 0.07;
      const amount = settled * breathing;

      return {
        x: nudge.x * amount,
        y: nudge.y * amount,
        active: true,
      };
    };

    const renderGrid = (time: number) => {
      const nudge = currentNudge(time);
      gl.useProgram(program);
      gl.uniform2f(resolutionLocation, viewWidth, viewHeight);
      gl.uniform2f(atlasSizeLocation, atlas.width, atlas.height);
      gl.uniform2f(
        offsetLocation,
        positionRef.current.x + nudge.x,
        positionRef.current.y + nudge.y,
      );
      gl.uniform1f(curvatureLocation, clamp(lensStrength, 0, 2.5));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLocation, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return nudge.active;
    };

    const tick = (time: number) => {
      const delta = Math.min(32, time - previousFrame);
      previousFrame = time;
      const drag = dragRef.current;
      const velocity = velocityRef.current;

      if (!drag.active && !reducedMotionRef.current) {
        positionRef.current.x += velocity.x * delta;
        positionRef.current.y += velocity.y * delta;
        const decay = Math.pow(safeInertia, delta / 16.667);
        velocity.x *= decay;
        velocity.y *= decay;
      } else if (!drag.active) {
        velocity.x = 0;
        velocity.y = 0;
      }

      const nudgeActive = renderGrid(time);
      const hasVelocity = Math.hypot(velocity.x, velocity.y) > 0.006;

      if (drag.active || hasVelocity || nudgeActive) {
        animationFrame = requestAnimationFrame(tick);
      } else {
        velocity.x = 0;
        velocity.y = 0;
        animationFrame = 0;
      }
    };

    const requestRender = () => {
      if (animationFrame) return;
      previousFrame = performance.now();
      animationFrame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewWidth = Math.max(1, rect.width);
      viewHeight = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.round(viewWidth * dpr));
      canvas.height = Math.max(1, Math.round(viewHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    resolvedItems.forEach((item, index) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) return;
        loadedImages[index] = image;
        drawAtlas();
        requestRender();
      };
      image.onerror = () => {
        if (disposed) return;
        drawAtlas();
        requestRender();
      };
      image.src = item.image;
    });
    drawAtlas();

    const commitNudge = (time: number) => {
      const nudge = currentNudge(time);
      if (!nudgeRef.current && !nudge.active) return;
      positionRef.current.x += nudge.x;
      positionRef.current.y += nudge.y;
      nudgeRef.current = null;
    };

    const onPointerEnter = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        event.buttons !== 0 ||
        reducedMotionRef.current ||
        dragRef.current.active ||
        hoverNudge <= 0
      ) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const fromLeft = event.clientX < rect.left + rect.width / 2;
      const fromTop = event.clientY < rect.top + rect.height / 2;
      nudgeRef.current = {
        startedAt: performance.now(),
        x: (fromLeft ? 1 : -1) * hoverNudge,
        y: (fromTop ? 1 : -1) * hoverNudge * 0.42,
      };
      requestRender();
    };

    const onPointerLeave = () => {
      if (dragRef.current.active) return;
      commitNudge(performance.now());
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      commitNudge(performance.now());
      dragRef.current = {
        active: true,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
      velocityRef.current = { x: 0, y: 0 };
      root.dataset.dragging = "true";
      root.setPointerCapture(event.pointerId);
      requestRender();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;

      const bounds = root.getBoundingClientRect();
      const outsidePreview =
        event.clientX <= bounds.left ||
        event.clientY <= bounds.top ||
        event.clientX >= bounds.right ||
        event.clientY >= bounds.bottom;
      if (outsidePreview) {
        drag.active = false;
        root.dataset.dragging = "false";
        if (root.hasPointerCapture(event.pointerId)) {
          root.releasePointerCapture(event.pointerId);
        }
        requestRender();
        return;
      }

      const time = performance.now();
      const deltaTime = Math.max(8, time - drag.time);
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      positionRef.current.x += deltaX;
      positionRef.current.y += deltaY;
      velocityRef.current.x = clamp(deltaX / deltaTime, -2.4, 2.4);
      velocityRef.current.y = clamp(deltaY / deltaTime, -2.4, 2.4);
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.time = time;
      requestRender();
    };

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;
      drag.active = false;
      root.dataset.dragging = "false";
      if (root.hasPointerCapture(event.pointerId)) {
        root.releasePointerCapture(event.pointerId);
      }
      requestRender();
    };

    const cancelDrag = () => {
      const drag = dragRef.current;
      if (!drag.active) return;
      drag.active = false;
      root.dataset.dragging = "false";
      if (root.hasPointerCapture(drag.pointerId)) {
        root.releasePointerCapture(drag.pointerId);
      }
      requestRender();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [42, 0],
        ArrowRight: [-42, 0],
        ArrowUp: [0, 42],
        ArrowDown: [0, -42],
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      commitNudge(performance.now());
      positionRef.current.x += direction[0];
      positionRef.current.y += direction[1];
      velocityRef.current = { x: 0, y: 0 };
      requestRender();
    };

    const onWheel = (event: WheelEvent) => {
      if (dragRef.current.active) return;
      event.preventDefault();
      commitNudge(performance.now());

      const modeMultiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? Math.max(viewHeight, 1)
            : 1;
      const impulse = Math.max(0, wheelSensitivity) * 0.003;
      velocityRef.current.x = clamp(
        velocityRef.current.x - event.deltaX * modeMultiplier * impulse,
        -1.25,
        1.25,
      );
      velocityRef.current.y = clamp(
        velocityRef.current.y - event.deltaY * modeMultiplier * impulse,
        -1.25,
        1.25,
      );
      requestRender();
    };

    root.addEventListener("pointerenter", onPointerEnter);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", cancelDrag);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("wheel", onWheel, { passive: false });
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      motionQuery.removeEventListener("change", syncMotionPreference);
      root.removeEventListener("pointerenter", onPointerEnter);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endDrag);
      root.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", cancelDrag);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("wheel", onWheel);
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    };
  }, [
    gap,
    hoverNudge,
    inertia,
    lensStrength,
    resolvedItems,
    resolvedTheme,
    tileHeight,
    tileWidth,
    wheelSensitivity,
  ]);

  return (
    <div
      {...rest}
      ref={rootRef}
      role="region"
      tabIndex={0}
      aria-label={ariaLabel}
      data-dragging="false"
      className={cn(
        "group/fisheye-grid relative isolate h-full w-full cursor-grab touch-none select-none overflow-hidden outline-none [perspective:900px] focus-visible:ring-2 focus-visible:ring-inset data-[dragging=true]:cursor-grabbing",
        resolvedTheme === "light"
          ? "bg-[#f1efe9] text-[#171717] focus-visible:ring-black/50"
          : "bg-[#070707] text-white focus-visible:ring-white/60",
        className,
      )}
      style={
        {
          ...style,
          WebkitFontSmoothing: "antialiased",
        } as CSSProperties
      }
    >
      <span className="sr-only">
        Drag in any direction or use the arrow keys to explore the infinite
        grid.
      </span>

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-50",
          resolvedTheme === "light"
            ? "bg-[radial-gradient(circle_at_center,transparent_48%,rgba(42,35,24,0.13)_100%)]"
            : "bg-[radial-gradient(circle_at_center,transparent_48%,rgba(0,0,0,0.28)_100%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-50 h-20 bg-gradient-to-b to-transparent",
          resolvedTheme === "light" ? "from-[#f1efe9]/50" : "from-black/45",
        )}
      />
    </div>
  );
}
