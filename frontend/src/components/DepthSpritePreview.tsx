import { useEffect, useRef, useState, type MutableRefObject } from 'react';

const vertexSource = [
  'attribute vec2 aPosition;',
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = aPosition * 0.5 + 0.5;',
  '  gl_Position = vec4(aPosition, 0.0, 1.0);',
  '}',
].join('\n');

const fragmentSource = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform sampler2D uImage;',
  'uniform sampler2D uDepth;',
  'uniform vec2 uPointer;',
  'uniform float uStrength;',
  'uniform float uFocus;',
  'uniform float uZoom;',
  'uniform float uEdgeGuard;',
  'uniform vec2 uUvScale;',
  'uniform vec2 uTexelSize;',
  'uniform int uSteps;',
  'const int MAX_STEPS = 48;',
  'float readDepth(vec2 uv) {',
  '  vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));',
  '  float depth = texture2D(uDepth, safeUv).r;',
  '  return smoothstep(0.015, 0.985, depth);',
  '}',
  'float readAlpha(vec2 uv) {',
  '  vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));',
  '  return texture2D(uImage, safeUv).a;',
  '}',
  'float smoothedAlpha(vec2 uv) {',
  '  vec2 texel = max(uTexelSize, vec2(0.0007));',
  '  float center = readAlpha(uv) * 4.0;',
  '  float cardinal = readAlpha(uv + vec2(texel.x, 0.0)) + readAlpha(uv - vec2(texel.x, 0.0)) + readAlpha(uv + vec2(0.0, texel.y)) + readAlpha(uv - vec2(0.0, texel.y));',
  '  float diagonal = readAlpha(uv + texel) + readAlpha(uv - texel) + readAlpha(uv + vec2(texel.x, -texel.y)) + readAlpha(uv + vec2(-texel.x, texel.y));',
  '  float coverage = (center + cardinal * 1.6 + diagonal * 0.7) / 13.2;',
  '  float original = readAlpha(uv);',
  '  float edge = 1.0 - smoothstep(0.08, 0.92, original);',
  '  return mix(original, coverage, edge * 0.72);',
  '}',
  'float depthEdge(vec2 uv) {',
  '  vec2 texel = max(uTexelSize, vec2(0.0007));',
  '  float center = readDepth(uv);',
  '  float left = readDepth(uv - vec2(texel.x * 2.0, 0.0));',
  '  float right = readDepth(uv + vec2(texel.x * 2.0, 0.0));',
  '  float down = readDepth(uv - vec2(0.0, texel.y * 2.0));',
  '  float up = readDepth(uv + vec2(0.0, texel.y * 2.0));',
  '  float cross = abs(left - right) + abs(down - up);',
  '  float centerPull = abs(center - left) + abs(center - right) + abs(center - down) + abs(center - up);',
  '  return max(cross, centerPull * 0.5);',
  '}',
  'void main() {',
  '  vec2 baseUv = (vUv - 0.5) * uUvScale + 0.5;',
  '  vec2 uv = (baseUv - 0.5) / uZoom + 0.5;',
  '  vec2 direction = -uPointer * uStrength;',
  '  float localDepth = readDepth(uv);',
  '  float localEdge = max(depthEdge(uv), depthEdge(uv + (localDepth - uFocus) * direction));',
  '  float edgeBrake = smoothstep(0.035, 0.18, localEdge) * uEdgeGuard;',
  '  direction *= 1.0 - edgeBrake * 0.82;',
  '  float alphaBrake = (1.0 - smoothstep(0.045, 0.32, readAlpha(uv))) * uEdgeGuard;',
  '  direction *= 1.0 - alphaBrake * 0.96;',
  '  float stepsF = float(uSteps);',
  '  vec2 hitUv = uv + (0.0 - uFocus) * direction;',
  '  vec2 previousUv = hitUv;',
  '  float previousDelta = -1.0;',
  '  float found = 0.0;',
  '  for (int i = 0; i < MAX_STEPS; i++) {',
  '    if (i >= uSteps) { break; }',
  '    float layer = 1.0 - float(i) / max(1.0, stepsF - 1.0);',
  '    vec2 sampleUv = uv + (layer - uFocus) * direction;',
  '    float depth = readDepth(sampleUv);',
  '    float delta = depth - layer;',
  '    if (delta >= 0.0) {',
  '      float denom = max(0.0001, delta - previousDelta);',
  '      float blend = clamp(delta / denom, 0.0, 1.0);',
  '      hitUv = mix(sampleUv, previousUv, blend);',
  '      float hitEdge = smoothstep(0.035, 0.18, depthEdge(sampleUv)) * uEdgeGuard;',
  '      hitUv = mix(hitUv, uv, hitEdge * 0.75);',
  '      found = 1.0;',
  '      break;',
  '    }',
  '    previousUv = sampleUv;',
  '    previousDelta = delta;',
  '  }',
  '  if (found < 0.5) { hitUv = previousUv; }',
  '  vec4 originalColor = texture2D(uImage, clamp(uv, vec2(0.001), vec2(0.999)));',
  '  vec4 shiftedColor = texture2D(uImage, clamp(hitUv, vec2(0.001), vec2(0.999)));',
  '  for (int repairStep = 1; repairStep <= 10; repairStep++) {',
  '    if (shiftedColor.a >= 0.08) { break; }',
  '    float repairBlend = float(repairStep) / 10.0;',
  '    vec2 repairUv = mix(hitUv, uv, repairBlend);',
  '    vec4 repairColor = texture2D(uImage, clamp(repairUv, vec2(0.001), vec2(0.999)));',
  '    if (repairColor.a > shiftedColor.a) {',
  '      shiftedColor = repairColor;',
  '    }',
  '  }',
  '  vec4 color = vec4(shiftedColor.rgb, smoothedAlpha(uv));',
  '  gl_FragColor = color;',
  '}',
].join('\n');

type Renderer = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  imageTexture: WebGLTexture;
  depthTexture: WebGLTexture;
  uniforms: {
    pointer: WebGLUniformLocation | null;
    strength: WebGLUniformLocation | null;
    focus: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    edgeGuard: WebGLUniformLocation | null;
    uvScale: WebGLUniformLocation | null;
    texelSize: WebGLUniformLocation | null;
    steps: WebGLUniformLocation | null;
  };
};

export interface DepthParallaxSettings {
  strength: number;
  focus: number;
  edgeFill: number;
  smearGuard: number;
  quality: 'clean';
}

interface DepthParallaxImageProps {
  imageSrc: string;
  depthSrc: string;
  alt: string;
  className?: string;
  layoutReferenceSrc?: string;
  fit?: 'contain' | 'cover';
  settings?: DepthParallaxSettings;
  pointerMode?: 'mouse' | 'circle';
  useWindowPointer?: boolean;
  strengthScale?: number;
  autoMotionSpeed?: number;
  autoMotionPauseMs?: number;
  alphaMode?: 'preserve' | 'opaque';
  alphaPaddingIterations?: number;
  disabled?: boolean;
  syncAutoMotion?: boolean;
  motionRef?: MutableRefObject<{ x: number; y: number }>;
}

interface DepthSpritePreviewProps {
  imageSrc: string;
  depthSrc: string;
  alt: string;
  className?: string;
}

const DEFAULT_SPRITE_DEPTH_SETTINGS: DepthParallaxSettings = {
  strength: 10,
  focus: 100,
  edgeFill: 0,
  smearGuard: 40,
  quality: 'clean',
};

export function DepthSpritePreview({ imageSrc, depthSrc, alt, className = '' }: DepthSpritePreviewProps) {
  return (
    <DepthParallaxImage
      imageSrc={imageSrc}
      depthSrc={depthSrc}
      alt={alt}
      className={className}
      fit="contain"
      settings={DEFAULT_SPRITE_DEPTH_SETTINGS}
      pointerMode="mouse"
      alphaMode="preserve"
    />
  );
}

export function DepthParallaxImage({
  imageSrc,
  depthSrc,
  alt,
  className = '',
  layoutReferenceSrc,
  fit = 'contain',
  settings = DEFAULT_SPRITE_DEPTH_SETTINGS,
  pointerMode = 'mouse',
  useWindowPointer = false,
  strengthScale = 1,
  autoMotionSpeed = 0,
  autoMotionPauseMs = 1200,
  alphaMode = 'preserve',
  alphaPaddingIterations = 80,
  disabled = false,
  syncAutoMotion = false,
  motionRef,
}: DepthParallaxImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [depthReady, setDepthReady] = useState(false);
  const rendererRef = useRef<Renderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const imageSizeRef = useRef({ width: 1, height: 1 });
  const depthSizeRef = useRef({ width: 1, height: 1 });
  const targetPointerRef = useRef({ x: 0, y: 0 });
  const easedPointerRef = useRef({ x: 0, y: 0 });
  const isPointerInsideRef = useRef(false);
  const needsResizeRef = useRef(true);
  const settingsRef = useRef(settings);
  const strengthScaleRef = useRef(strengthScale);
  const autoMotionSpeedRef = useRef(autoMotionSpeed);
  const autoMotionPauseMsRef = useRef(autoMotionPauseMs);
  const lastPointerMoveRef = useRef(0);
  const disabledRef = useRef(disabled);
  const syncAutoMotionRef = useRef(syncAutoMotion);
  const motionRefRef = useRef(motionRef);

  useEffect(() => {
    settingsRef.current = settings;
    strengthScaleRef.current = strengthScale;
    autoMotionSpeedRef.current = autoMotionSpeed;
    autoMotionPauseMsRef.current = autoMotionPauseMs;
    disabledRef.current = disabled;
    syncAutoMotionRef.current = syncAutoMotion;
    motionRefRef.current = motionRef;
  }, [autoMotionPauseMs, autoMotionSpeed, disabled, motionRef, settings, strengthScale, syncAutoMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    setDepthReady(false);
    if (!canvas || !stage) {
      return undefined;
    }

    const renderer = createRenderer(canvas);
    if (!renderer) {
      return undefined;
    }

    rendererRef.current = renderer;
    let cancelled = false;

    const normalizedLayoutReferenceSrc = layoutReferenceSrc?.trim() || '';
    const shouldLoadLayoutReference =
      normalizedLayoutReferenceSrc.length > 0 && normalizedLayoutReferenceSrc !== imageSrc;

    Promise.all([
      loadImage(imageSrc),
      loadImage(depthSrc),
      shouldLoadLayoutReference ? loadImage(normalizedLayoutReferenceSrc) : Promise.resolve(null),
    ])
      .then(([image, depth, layoutReferenceImage]) => {
        if (cancelled) {
          return;
        }
        const layoutImage = layoutReferenceImage || image;
        imageSizeRef.current = { width: layoutImage.naturalWidth || 1, height: layoutImage.naturalHeight || 1 };
        depthSizeRef.current = { width: depth.naturalWidth || 1, height: depth.naturalHeight || 1 };
        uploadTexture(
          renderer,
          renderer.imageTexture,
          alphaMode === 'preserve' ? createAlphaPaddedImage(image, alphaPaddingIterations) : image,
          renderer.gl.TEXTURE0,
        );
        uploadTexture(renderer, renderer.depthTexture, depth, renderer.gl.TEXTURE1);
        needsResizeRef.current = true;
        window.requestAnimationFrame(() => {
          if (!cancelled) {
            setDepthReady(true);
          }
        });
      })
      .catch(() => {
        rendererRef.current = null;
      });

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      lastPointerMoveRef.current = performance.now();
      isPointerInsideRef.current = true;
      targetPointerRef.current = {
        x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        y: clamp(-(((event.clientY - rect.top) / rect.height) * 2 - 1), -1, 1),
      };
    };
    const resetPointer = () => {
      lastPointerMoveRef.current = performance.now();
      isPointerInsideRef.current = false;
      targetPointerRef.current = { x: 0, y: 0 };
    };
    const updatePointerListener = updatePointer as EventListener;
    const resize = () => {
      needsResizeRef.current = true;
    };

    const pointerTarget = useWindowPointer ? window : (stage.closest('.editor-preview-card') as HTMLElement | null) || stage;
    if (pointerMode === 'mouse') {
      pointerTarget.addEventListener('pointermove', updatePointerListener);
      pointerTarget.addEventListener('pointerleave', resetPointer);
      pointerTarget.addEventListener('pointercancel', resetPointer);
    }
    window.addEventListener('resize', resize);

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
    }

    const frame = () => {
      const activeRenderer = rendererRef.current;
      if (!activeRenderer) {
        return;
      }
      if (needsResizeRef.current) {
        resizeCanvas(stage, canvas, imageSizeRef.current, activeRenderer, fit);
        needsResizeRef.current = false;
      }

      const target = targetPointerRef.current;
      const now = performance.now();
      const sharedMotion = motionRefRef.current?.current;
      if (sharedMotion) {
        target.x = sharedMotion.x;
        target.y = sharedMotion.y;
        isPointerInsideRef.current = true;
      } else if (pointerMode === 'circle' && !disabledRef.current) {
        const elapsedSeconds = now / 1000;
        target.x = Math.cos(elapsedSeconds * 0.72) * 0.82;
        target.y = Math.sin(elapsedSeconds * 0.72) * 0.82;
        isPointerInsideRef.current = true;
      } else if (disabledRef.current) {
        target.x = 0;
        target.y = 0;
      } else if (autoMotionSpeedRef.current > 0 && now - lastPointerMoveRef.current > autoMotionPauseMsRef.current) {
        const elapsedSeconds = now / 1000;
        const angularSpeed = 0.18 + (autoMotionSpeedRef.current / 100) * 1.05;
        target.x = Math.cos(elapsedSeconds * angularSpeed) * 0.62;
        target.y = Math.sin(elapsedSeconds * angularSpeed) * 0.62;
        isPointerInsideRef.current = true;
      }
      const eased = easedPointerRef.current;
      if (sharedMotion || (syncAutoMotionRef.current && (pointerMode === 'circle' || autoMotionSpeedRef.current > 0))) {
        eased.x = target.x;
        eased.y = target.y;
      } else {
        const ease = isPointerInsideRef.current ? 0.18 : 0.12;
        eased.x += (target.x - eased.x) * ease;
        eased.y += (target.y - eased.y) * ease;
      }
      draw(activeRenderer, eased, depthSizeRef.current, settingsRef.current, strengthScaleRef.current);
      frameRef.current = window.requestAnimationFrame(frame);
    };
    frameRef.current = window.requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      if (pointerMode === 'mouse') {
        pointerTarget.removeEventListener('pointermove', updatePointerListener);
        pointerTarget.removeEventListener('pointerleave', resetPointer);
        pointerTarget.removeEventListener('pointercancel', resetPointer);
      }
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      rendererRef.current = null;
    };
  }, [alphaMode, alphaPaddingIterations, depthSrc, fit, imageSrc, layoutReferenceSrc, pointerMode, useWindowPointer]);

  return (
    <div ref={stageRef} className={`depth-sprite-preview ${depthReady ? 'is-depth-ready' : ''} ${className}`.trim()}>
      <canvas ref={canvasRef} aria-label={alt} />
      <img src={imageSrc} alt={alt} />
    </div>
  );
}

function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }

  const program = createProgram(gl, vertexSource, fragmentSource);
  const buffer = gl.createBuffer();
  const imageTexture = createTexture(gl);
  const depthTexture = createTexture(gl);
  if (!program || !buffer || !imageTexture || !depthTexture) {
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uDepth'), 1);

  return {
    gl,
    program,
    imageTexture,
    depthTexture,
    uniforms: {
      pointer: gl.getUniformLocation(program, 'uPointer'),
      strength: gl.getUniformLocation(program, 'uStrength'),
      focus: gl.getUniformLocation(program, 'uFocus'),
      zoom: gl.getUniformLocation(program, 'uZoom'),
      edgeGuard: gl.getUniformLocation(program, 'uEdgeGuard'),
      uvScale: gl.getUniformLocation(program, 'uUvScale'),
      texelSize: gl.getUniformLocation(program, 'uTexelSize'),
      steps: gl.getUniformLocation(program, 'uSteps'),
    },
  };
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function createProgram(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram | null {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) {
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return texture;
}

function uploadTexture(renderer: Renderer, texture: WebGLTexture, source: TexImageSource, unit: number) {
  const { gl } = renderer;
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load depth preview image.'));
    image.src = src;
  });
}

function createAlphaPaddedImage(image: HTMLImageElement, iterations: number): TexImageSource {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return image;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    return image;
  }

  const padded = defringeAndPadAlphaRgb(imageData, width, height, Math.max(0, Math.round(iterations)));
  context.putImageData(padded, 0, 0);
  return canvas;
}

function defringeAndPadAlphaRgb(imageData: ImageData, width: number, height: number, iterations: number): ImageData {
  const original = imageData.data;
  let maxAlpha = 0;
  for (let offset = 3; offset < original.length; offset += 4) {
    maxAlpha = Math.max(maxAlpha, original[offset]);
  }

  if (maxAlpha === 0) {
    return imageData;
  }

  const seedAlpha = Math.max(16, Math.min(245, Math.round(maxAlpha * 0.92)));
  let source = new Uint8ClampedArray(imageData.data);
  let target = new Uint8ClampedArray(source);
  const pixelCount = width * height;
  let known = new Uint8Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    known[pixel] = original[pixel * 4 + 3] >= seedAlpha ? 1 : 0;
  }

  for (let pass = 0; pass < iterations; pass += 1) {
    let changed = false;
    const nextKnown = new Uint8Array(known);
    target.set(source);

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (known[pixel]) {
        continue;
      }

      const offset = pixel * 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;

      for (let oy = -1; oy <= 1; oy += 1) {
        const sampleY = y + oy;
        if (sampleY < 0 || sampleY >= height) {
          continue;
        }
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) {
            continue;
          }
          const sampleX = x + ox;
          if (sampleX < 0 || sampleX >= width) {
            continue;
          }
          const samplePixel = sampleY * width + sampleX;
          if (!known[samplePixel]) {
            continue;
          }
          const sampleOffset = samplePixel * 4;
          red += source[sampleOffset];
          green += source[sampleOffset + 1];
          blue += source[sampleOffset + 2];
          samples += 1;
        }
      }

      if (samples === 0) {
        continue;
      }

      target[offset] = Math.round(red / samples);
      target[offset + 1] = Math.round(green / samples);
      target[offset + 2] = Math.round(blue / samples);
      target[offset + 3] = original[offset + 3];
      nextKnown[pixel] = 1;
      changed = true;
    }

    if (!changed) {
      break;
    }

    const previous = source;
    source = target;
    target = previous;
    known = nextKnown;
  }

  return new ImageData(source, width, height);
}

function resizeCanvas(
  stage: HTMLDivElement,
  canvas: HTMLCanvasElement,
  imageSize: { width: number; height: number },
  renderer: Renderer,
  fit: 'contain' | 'cover',
) {
  const stageRect = stage.getBoundingClientRect();
  const availableWidth = Math.max(1, stage.offsetWidth || stageRect.width);
  const availableHeight = Math.max(1, stage.offsetHeight || stageRect.height);
  const imageAspect = Math.max(0.01, imageSize.width / Math.max(1, imageSize.height));
  let width = availableWidth;
  let height = fit === 'cover' ? availableHeight : width / imageAspect;

  if (fit === 'contain' && height > availableHeight) {
    height = availableHeight;
    width = height * imageAspect;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.round(width)}px`;
  canvas.style.height = `${Math.round(height)}px`;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  renderer.gl.viewport(0, 0, canvas.width, canvas.height);

  const canvasAspect = Math.max(0.01, width / Math.max(1, height));
  const uvScale =
    fit === 'cover'
      ? canvasAspect > imageAspect
        ? { x: 1, y: imageAspect / canvasAspect }
        : { x: canvasAspect / imageAspect, y: 1 }
      : { x: 1, y: 1 };
  renderer.gl.useProgram(renderer.program);
  renderer.gl.uniform2f(renderer.uniforms.uvScale, uvScale.x, uvScale.y);
}

function draw(
  renderer: Renderer,
  pointer: { x: number; y: number },
  depthSize: { width: number; height: number },
  settings: DepthParallaxSettings,
  strengthScale: number,
) {
  const { gl } = renderer;
  gl.useProgram(renderer.program);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.imageTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, renderer.depthTexture);
  gl.uniform2f(renderer.uniforms.pointer, pointer.x, pointer.y);
  gl.uniform1f(renderer.uniforms.strength, settings.strength * 0.0012 * strengthScale);
  gl.uniform1f(renderer.uniforms.focus, settings.focus / 100);
  gl.uniform1f(renderer.uniforms.zoom, 1 + settings.edgeFill / 100);
  gl.uniform1f(renderer.uniforms.edgeGuard, settings.smearGuard / 100);
  gl.uniform2f(renderer.uniforms.texelSize, 1 / Math.max(1, depthSize.width), 1 / Math.max(1, depthSize.height));
  gl.uniform1i(renderer.uniforms.steps, 44);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
