import { motion, useTransform, type MotionValue } from 'framer-motion';

const ATLAS_SRC = '/assets/maps/walkin-us-atlas.webp';
const PAPER_SRC = '/assets/maps/walkin-silver-paper.webp';
const SILHOUETTE_SRC = '/assets/maps/walkin-us-silhouette.webp';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

export type WalkInMapVariant = 'develop' | 'emboss' | 'register';

type AtlasStop = {
  id: string;
  point: [number, number];
};

type Props = {
  variant: WalkInMapVariant;
  width: number;
  height: number;
  routePath: string;
  routePoints: [number, number][];
  stops: AtlasStop[];
  routeDraw: MotionValue<number>;
  scrollProgress: MotionValue<number>;
  reducedMotion: boolean;
  stageVisible: boolean;
};

function pointAtProgress(points: [number, number][], progress: number): [number, number] {
  if (points.length === 0) return [800, 478];
  if (points.length === 1) return points[0];

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    total += Math.hypot(x2 - x1, y2 - y1);
    lengths.push(total);
  }

  const target = Math.max(0, Math.min(1, progress)) * total;
  const segment = lengths.findIndex((length) => length >= target);
  if (segment === -1) return points[points.length - 1];

  const previousLength = segment === 0 ? 0 : lengths[segment - 1];
  const segmentLength = Math.max(0.001, lengths[segment] - previousLength);
  const local = (target - previousLength) / segmentLength;
  const [x1, y1] = points[segment];
  const [x2, y2] = points[segment + 1];
  return [x1 + (x2 - x1) * local, y1 + (y2 - y1) * local];
}

function Stops({ stops, treatment }: { stops: AtlasStop[]; treatment: WalkInMapVariant }) {
  return stops.map(({ id, point: [x, y] }, index) => {
    const isRegistration = treatment === 'register';
    const isEmboss = treatment === 'emboss';
    return (
      <g key={id} transform={`translate(${x} ${y})`} opacity={0.72 + Math.min(index, 3) * 0.035}>
        {isEmboss && <circle cx="1.5" cy="1.8" r="9.5" fill="#14170f" fillOpacity="0.42" />}
        {isRegistration && (
          <circle cx="-3" cy="2" r="9" fill="none" stroke="rgba(238,237,226,0.24)" strokeWidth="1.2" />
        )}
        <circle
          r={isRegistration ? 7.5 : 8.5}
          fill="rgba(39,44,31,0.92)"
          stroke={isEmboss ? 'rgba(238,237,226,0.32)' : LIME}
          strokeOpacity={isEmboss ? 0.72 : 0.58}
          strokeWidth={isEmboss ? 1.35 : 1.15}
        />
        <circle r={isEmboss ? 2.5 : 2.9} fill={LIME} fillOpacity={isEmboss ? 0.72 : 0.92} />
      </g>
    );
  });
}

function PaperTexture({ opacity }: { opacity: number }) {
  return (
    <img
      src={PAPER_SRC}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ opacity }}
      width="1600"
      height="956"
      loading="eager"
      decoding="async"
      fetchPriority="high"
      draggable={false}
    />
  );
}

export default function WalkInMapArtwork({
  variant,
  width,
  height,
  routePath,
  routePoints,
  stops,
  routeDraw,
  scrollProgress,
  reducedMotion,
  stageVisible,
}: Props) {
  const exposureX = useTransform(routeDraw, (value) => pointAtProgress(routePoints, value)[0]);
  const exposureY = useTransform(routeDraw, (value) => pointAtProgress(routePoints, value)[1]);
  const exposureRadius = useTransform(scrollProgress, [0, 0.72], [180, 520], { clamp: true });
  const grazingX = useTransform(scrollProgress, [0, 0.68], ['-16%', '16%'], { clamp: true });
  const registrationOffset = useTransform(scrollProgress, [0, 0.82], [11, 0], { clamp: true });
  const registrationOffsetBack = useTransform(registrationOffset, (value) => -value * 0.72);
  const registrationOffsetY = useTransform(registrationOffset, (value) => value * 0.42);
  const registrationOffsetYBack = useTransform(registrationOffset, (value) => -value * 0.28);
  const routeGhostOpacity = useTransform(scrollProgress, [0.18, 0.70], [0.34, 0.12], { clamp: true });

  if (variant === 'emboss') {
    return (
      <div
        data-walkin-map-artwork="emboss"
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <PaperTexture opacity={0.86} />
        <img
          src={SILHOUETTE_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.055]"
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_52%_46%,rgba(240,239,228,0.045)_0%,transparent_62%)]" />
        <img
          src={ATLAS_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.38]"
          style={{ transform: 'translate(-1.1px, -1.1px)', filter: 'brightness(1.12)' }}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <img
          src={ATLAS_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.34]"
          style={{ transform: 'translate(1.45px, 1.6px)', filter: 'brightness(0)' }}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <motion.div
          className="absolute -inset-y-[18%] left-[18%] w-[42%] rotate-[8deg] bg-[linear-gradient(90deg,transparent_0%,rgba(246,244,231,0.045)_34%,rgba(246,244,231,0.14)_51%,rgba(246,244,231,0.035)_66%,transparent_100%)]"
          style={{ x: reducedMotion ? '0%' : grazingX, willChange: !reducedMotion && stageVisible ? 'transform' : 'auto' }}
        />
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
          <path
            d={routePath}
            fill="none"
            stroke="rgba(10,12,8,0.24)"
            strokeWidth="3.4"
            transform="translate(1.6 1.8)"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d={routePath}
            fill="none"
            stroke={LIME}
            strokeWidth="2.25"
            strokeOpacity="0.82"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ pathLength: reducedMotion ? 1 : routeDraw }}
          />
          <Stops stops={stops} treatment="emboss" />
        </svg>
      </div>
    );
  }

  if (variant === 'register') {
    return (
      <div
        data-walkin-map-artwork="register"
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <PaperTexture opacity={0.70} />
        <img
          src={SILHOUETTE_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.045]"
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_36%_62%,rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.12)_0%,transparent_58%)]" />
        <img
          src={ATLAS_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.13]"
          style={{ filter: 'brightness(0)' }}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <motion.img
          src={ATLAS_SRC}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-[0.42]"
          style={{
            x: reducedMotion ? 0 : registrationOffsetBack,
            y: reducedMotion ? 0 : registrationOffsetY,
            willChange: !reducedMotion && stageVisible ? 'transform' : 'auto',
          }}
          width={width}
          height={height}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
        <motion.div
          className="absolute inset-0 opacity-[0.36]"
          style={{
            x: reducedMotion ? 0 : registrationOffset,
            y: reducedMotion ? 0 : registrationOffsetYBack,
            backgroundColor: LIME,
            WebkitMaskImage: `url(${ATLAS_SRC})`,
            maskImage: `url(${ATLAS_SRC})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            mixBlendMode: 'screen',
            willChange: !reducedMotion && stageVisible ? 'transform' : 'auto',
          }}
        />
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
          <motion.g
            style={{
              x: reducedMotion ? 0 : registrationOffsetBack,
              y: reducedMotion ? 0 : registrationOffsetY,
              opacity: routeGhostOpacity,
            }}
          >
            <path
              d={routePath}
              fill="none"
              stroke="rgba(238,237,226,0.78)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </motion.g>
          <motion.path
            d={routePath}
            fill="none"
            stroke={LIME}
            strokeWidth="2.35"
            strokeOpacity="0.92"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ pathLength: reducedMotion ? 1 : routeDraw }}
          />
          <Stops stops={stops} treatment="register" />
        </svg>
      </div>
    );
  }

  return (
    <div
      data-walkin-map-artwork="develop"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <PaperTexture opacity={0.92} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_48%_48%,rgba(239,238,225,0.055)_0%,transparent_70%)]" />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="walkin-development-falloff">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="56%" stopColor="white" stopOpacity="0.82" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="walkin-development-glow">
            <stop offset="0%" stopColor={LIME} stopOpacity="0.28" />
            <stop offset="55%" stopColor={LIME} stopOpacity="0.10" />
            <stop offset="100%" stopColor={LIME} stopOpacity="0" />
          </radialGradient>
          <mask id="walkin-development-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="black" />
            <motion.circle
              cx={reducedMotion ? width * 0.5 : exposureX}
              cy={reducedMotion ? height * 0.5 : exposureY}
              r={reducedMotion ? 620 : exposureRadius}
              fill="url(#walkin-development-falloff)"
            />
          </mask>
          <filter id="walkin-development-softness" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <motion.circle
          cx={reducedMotion ? width * 0.5 : exposureX}
          cy={reducedMotion ? height * 0.5 : exposureY}
          r={reducedMotion ? 620 : exposureRadius}
          fill="url(#walkin-development-glow)"
        />
        <image href={SILHOUETTE_SRC} width={width} height={height} opacity="0.07" />
        <image href={ATLAS_SRC} width={width} height={height} opacity="0.12" />
        <g mask="url(#walkin-development-mask)">
          <image href={SILHOUETTE_SRC} width={width} height={height} opacity="0.15" />
          <image href={ATLAS_SRC} width={width} height={height} opacity="0.48" filter="url(#walkin-development-softness)" />
          <image href={ATLAS_SRC} width={width} height={height} opacity="0.24" />
        </g>
        <path
          d={routePath}
          fill="none"
          stroke="rgba(235,237,226,0.52)"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <motion.path
          d={routePath}
          fill="none"
          stroke={LIME}
          strokeWidth="2.35"
          strokeOpacity="0.88"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: reducedMotion ? 1 : routeDraw }}
        />
        <Stops stops={stops} treatment="develop" />
      </svg>
    </div>
  );
}
