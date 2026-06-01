import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

/**
 * LiquidImage — a WebGL hover overlay that renders an image with a real pixel
 * displacement (ripple around the cursor) + subtle chromatic split, for the
 * Zajno-style "liquid" cover hover. Layered ON TOP of the existing <img>:
 * fades in only while hovered, so if WebGL or the texture (CORS) fails it
 * simply never shows and the normal cover + sheen remain as a fallback.
 *
 * Driven by motion values (0–100 %) for the cursor, so it doesn't re-render.
 */
const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uCover;      // object-cover crop scale
uniform vec2 uMouse;      // 0..1
uniform float uIntensity; // 0..1
uniform float uTime;
void main(){
  vec2 uv = (vUv - 0.5) * uCover + 0.5;        // emulate object-cover
  vec2 d = uv - uMouse;
  float dist = length(d);
  float falloff = smoothstep(0.5, 0.0, dist);
  float ripple = sin(dist * 34.0 - uTime * 4.0);
  vec2 disp = normalize(d + 0.0001) * ripple * 0.010 * falloff;
  disp += vec2(sin(uv.y * 7.0 + uTime), cos(uv.x * 7.0 + uTime * 0.9)) * 0.0020;
  uv += disp * uIntensity;
  float ca = 0.0024 * uIntensity * falloff;
  float r = texture2D(uTex, uv + vec2(ca, 0.0)).r;
  float g = texture2D(uTex, uv).g;
  float b = texture2D(uTex, uv - vec2(ca, 0.0)).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}

export default function LiquidImage({
  src,
  active,
  mx,
  my,
  className = '',
}: {
  src: string;
  active: boolean;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    let raf = 0;
    let disposed = false;
    let intensity = 0;
    let coverX = 1;
    let coverY = 1;
    const startTime = performance.now();
    let uIntensity: WebGLUniformLocation | null = null;
    let uMouse: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uCover: WebGLUniformLocation | null = null;

    function computeCover(iw: number, ih: number) {
      const cw = canvas!.clientWidth || 1;
      const ch = canvas!.clientHeight || 1;
      const ca = cw / ch;
      const ia = iw / ih;
      if (ca > ia) { coverX = 1; coverY = ia / ca; }
      else { coverX = ca / ia; coverY = 1; }
    }

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round((canvas!.clientWidth || 1) * dpr);
      const h = Math.round((canvas!.clientHeight || 1) * dpr);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        if (gl) gl.viewport(0, 0, w, h);
      }
    }

    try {
      gl = (canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true }) ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) return; // no WebGL → fallback (overlay stays invisible)

      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      uIntensity = gl.getUniformLocation(prog, 'uIntensity');
      uMouse = gl.getUniformLocation(prog, 'uMouse');
      uTime = gl.getUniformLocation(prog, 'uTime');
      uCover = gl.getUniformLocation(prog, 'uCover');

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      let ready = false;
      img.onload = () => {
        if (disposed || !gl) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          computeCover(img.naturalWidth, img.naturalHeight);
          ready = true;
        } catch {
          ready = false; // tainted/CORS — leave overlay invisible
        }
      };
      img.src = src;

      const loop = () => {
        if (disposed || !gl) return;
        const target = activeRef.current ? 1 : 0;
        intensity += (target - intensity) * 0.12;
        // Park the loop when fully idle to save GPU.
        if (!activeRef.current && intensity < 0.01) {
          intensity = 0;
          canvas!.style.opacity = '0';
          raf = 0;
          return;
        }
        if (ready) {
          sizeCanvas();
          gl.uniform1f(uIntensity, intensity);
          gl.uniform1f(uTime, (performance.now() - startTime) / 1000);
          gl.uniform2f(uMouse, mx.get() / 100, 1 - my.get() / 100);
          gl.uniform2f(uCover, coverX, coverY);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          canvas!.style.opacity = String(Math.min(intensity * 1.4, 1));
        }
        raf = requestAnimationFrame(loop);
      };

      // Kick the loop whenever the cover becomes active.
      const kick = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };
      const unsub = [mx, my].map((mv) => mv.on('change', kick));
      // also poll active via a tiny rAF starter when prop flips
      const starter = setInterval(() => { if (activeRef.current) kick(); }, 200);

      return () => {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(starter);
        unsub.forEach((u) => u());
        const lose = gl?.getExtension('WEBGL_lose_context');
        lose?.loseContext();
      };
    } catch {
      // Any WebGL failure → overlay stays invisible; normal cover is the fallback.
      return;
    }
  }, [src, mx, my]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
      aria-hidden="true"
    />
  );
}
