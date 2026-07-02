/**
 * Flow-field contour atmosphere — a WebGL fragment shader that draws the
 * iso-lines of an fbm noise field (the landonorris.com background language).
 *
 * The look: thin, smooth, organic flowing curves — nested closed loops and
 * long S-shaped streamlines, like a topographic map. Sparse (a handful of
 * lines on screen), ~1px, faint electric-lime on the deep-olive page, with the
 * occasional segment lit a little brighter. It draws ONLY the lines (transparent
 * output) so the page's olive shows through — no background-colour seam.
 *
 * Motion is SCROLL-DRIVEN, not time-driven: scroll position feeds a flow value
 * that an exponential ease chases (a Lenis-like inertia — the field keeps
 * flowing a moment after you stop), plus a whisper of idle drift so it's never
 * fully frozen. A `u_invert` uniform cross-fades the lines to a dark grey for
 * any light section that opts in via [data-atmos-theme="light"] (dormant while
 * the site is all-dark). Honors prefers-reduced-motion (one static frame).
 *
 * Exports `startAtmosphere(canvas): () => void` — the contract SiteAtmosphere
 * (home/about) and travel.astro rely on.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2  u_res;
uniform float u_flow;    // flow amount (scroll-driven + idle drift)
uniform float u_invert;  // 0 = dark section (lime lines) → 1 = light section (grey)
uniform vec3  u_lime;    // brand accent, 0..1

/* ---- tunables ---- */
const float FIELD_SCALE = 1.35;  // zoom of the noise field (smaller = bigger forms)
const float DENSITY     = 3.5;   // iso-line count (higher = denser)
const float LINE_ALPHA  = 0.22;  // base line opacity on the olive page
const int   OCTAVES     = 2;     // fbm detail (low = smooth sweeping curves)
/* ------------------ */

const vec3 LINE_GREY = vec3(0.42, 0.44, 0.36); // lines over a light section

vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x*x0.x + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < OCTAVES; i++){ v += a*snoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;

  // Scroll-driven advection of the field.
  float field = fbm(uv * FIELD_SCALE + vec2(u_flow, u_flow * 0.4));

  // Iso-lines: distance to the nearest equally-spaced threshold, AA'd by the
  // field's screen-space gradient (fwidth) so lines stay ~1px at any zoom.
  float f = fract(field * DENSITY);
  float d = min(f, 1.0 - f) / DENSITY;
  float wd = fwidth(field);
  float line = 1.0 - smoothstep(0.0, wd * 1.5, d);

  // A slow second field lifts a few segments brighter — one line "lit up".
  float boost = smoothstep(0.55, 0.9, snoise(uv * 0.6 + u_flow * 0.3)) * 0.12;

  vec3 col = mix(u_lime, LINE_GREY, u_invert);
  float alpha = clamp(line * (LINE_ALPHA + boost), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha); // straight alpha (premultipliedAlpha:false)
}`;

export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
    depth: false,
    powerPreference: 'low-power',
  }) as WebGLRenderingContext | null;
  if (!gl) return () => {}; // no WebGL → page olive shows, no lines

  gl.getExtension('OES_standard_derivatives'); // fwidth in the frag shader

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('atmosphere shader:', gl.getShaderInfoLog(s));
    }
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // One big fullscreen triangle.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uFlow = gl.getUniformLocation(prog, 'u_flow');
  const uInvert = gl.getUniformLocation(prog, 'u_invert');
  const uLime = gl.getUniformLocation(prog, 'u_lime');

  // Lime from the live accent var.
  const root = getComputedStyle(document.documentElement);
  const cv = (n: string, f: number) => {
    const v = parseFloat(root.getPropertyValue(n));
    return (Number.isFinite(v) ? v : f) / 255;
  };
  const lime: [number, number, number] = [cv('--accent-r', 210), cv('--accent-g', 255), cv('--accent-b', 0)];

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // fragment-heavy → cap
    canvas.width = Math.round((canvas.clientWidth || window.innerWidth) * dpr);
    canvas.height = Math.round((canvas.clientHeight || window.innerHeight) * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  // Light-section inversion — only wired if any section opts in (dormant on the
  // all-dark site). Kept cheap: a cached node list, checked against scroll.
  let lightEls: HTMLElement[] = [];
  const scanLight = () => {
    lightEls = Array.from(document.querySelectorAll<HTMLElement>('[data-atmos-theme="light"]'));
  };
  scanLight();

  let flow = 0;
  let flowTarget = 0;
  let invert = 0;
  let invertTarget = 0;
  let scrollY = window.scrollY || 0;

  const onScroll = () => { scrollY = window.scrollY || 0; };
  window.addEventListener('scroll', onScroll, { passive: true });

  const updateTargets = () => {
    flowTarget = scrollY * 0.0015; // scroll distance → flow (small = slow)
    if (lightEls.length) {
      const mid = scrollY + window.innerHeight / 2;
      let light = false;
      for (const el of lightEls) {
        const top = el.offsetTop;
        if (mid >= top && mid < top + el.offsetHeight) { light = true; break; }
      }
      invertTarget = light ? 1 : 0;
    }
  };

  const draw = (uFlowVal: number) => {
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uFlow, uFlowVal);
    gl.uniform1f(uInvert, invert);
    gl.uniform3f(uLime, lime[0], lime[1], lime[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let raf = 0;
  let t0 = -1;
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  if (reduce) {
    draw(0); // static iso-lines, no flow
  } else {
    const loop = (now: number) => {
      if (!canvas.isConnected) { stop(); return; }
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t0 < 0) t0 = now;
      const elapsed = (now - t0) * 0.001;
      updateTargets();
      // Exponential ease → inertia (keeps flowing a beat after scroll stops).
      flow += (flowTarget - flow) * 0.06;
      invert += (invertTarget - invert) * 0.08;
      draw(flow + elapsed * 0.02); // + a whisper of idle drift
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
