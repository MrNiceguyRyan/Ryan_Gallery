import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  color: string;
  size: number;
  vx: number;
  vy: number;
  force: number;
  angle: number;
  distance: number;
  friction: number;
  ease: number;
}

interface ParticleTitleProps {
  text: string;
  className?: string;
  onHover?: (isHovering: boolean) => void;
}

const ParticleTitle: React.FC<ParticleTitleProps> = ({ text, className, onHover }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: -9999, y: -9999, radius: 120 });
  const animationRef = useRef<number>(0);
  const isInitializedRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Draw text to sample pixels
    ctx.fillStyle = 'white';
    const fontSize = Math.min(dimensions.width / 4.5, 240);
    ctx.font = `italic 900 ${fontSize}px "Playfair Display", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = text.split('<br/>');
    const lineHeight = fontSize * 0.9;

    lines.forEach((line, index) => {
      ctx.fillText(
        line.replace(/<[^>]*>?/gm, ''),
        dimensions.width / 2,
        dimensions.height / 2 + (index - (lines.length - 1) / 2) * lineHeight,
      );
    });

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const newParticles: Particle[] = [];
    const gap = dimensions.width > 2000 ? 5 : 3;

    for (let y = 0; y < canvas.height; y += gap) {
      for (let x = 0; x < canvas.width; x += gap) {
        const index = (y * canvas.width + x) * 4;
        const alpha = pixels[index + 3];
        if (alpha > 128) {
          if (newParticles.length > 25000) break;

          // Initial bounce effect: particles start scattered far from origin
          const isFirstInit = !isInitializedRef.current;
          const scatterX = isFirstInit
            ? dimensions.width / 2 + (Math.random() - 0.5) * dimensions.width * 1.5
            : x + (Math.random() - 0.5) * 30;
          const scatterY = isFirstInit
            ? dimensions.height / 2 + (Math.random() - 0.5) * dimensions.height * 1.5
            : y + (Math.random() - 0.5) * 30;

          newParticles.push({
            x: scatterX,
            y: scatterY,
            originX: x,
            originY: y,
            color: 'white',
            size: 1.2,
            // Initial velocity for bounce effect
            vx: isFirstInit ? (Math.random() - 0.5) * 8 : 0,
            vy: isFirstInit ? (Math.random() - 0.5) * 8 : 0,
            force: 0,
            angle: 0,
            distance: 0,
            friction: 0.88, // Slightly lower friction for bouncier initial settle
            ease: 0.06, // Slightly lower ease for more bounce overshoot
          });
        }
      }
    }
    particles.current = newParticles;
    isInitializedRef.current = true;

    // After initial bounce, gradually tighten spring to final values
    let frameCount = 0;
    const SETTLE_FRAMES = 120; // ~2 seconds at 60fps

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouseX = mouse.current.x;
      const mouseY = mouse.current.y;
      const radius = mouse.current.radius;
      const radiusSq = radius * radius;

      // Gradually increase friction and ease for settling effect
      frameCount++;
      const settleProgress = Math.min(frameCount / SETTLE_FRAMES, 1);
      const currentFriction = 0.88 + settleProgress * 0.04; // 0.88 → 0.92
      const currentEase = 0.06 + settleProgress * 0.02; // 0.06 → 0.08

      for (let i = 0; i < particles.current.length; i++) {
        const p = particles.current[i];
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq) {
          const distance = Math.sqrt(distSq);
          const force = (radius - distance) / radius;
          const angle = Math.atan2(dy, dx);
          p.vx -= force * Math.cos(angle) * 4.0;
          p.vy -= force * Math.sin(angle) * 4.0;
        }

        // Spring physics with settling parameters
        p.vx += (p.originX - p.x) * currentEase;
        p.vy += (p.originY - p.y) * currentEase;
        p.vx *= currentFriction;
        p.vy *= currentFriction;
        p.x += p.vx;
        p.y += p.vy;

        // Subtle alpha variation based on velocity for "energy" visualization
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const alpha = Math.min(1, 0.6 + speed * 0.15);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [dimensions, text]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
      if (onHover) onHover(true);
    },
    [onHover],
  );

  const handleMouseLeave = useCallback(() => {
    mouse.current.x = -9999;
    mouse.current.y = -9999;
    if (onHover) onHover(false);
  }, [onHover]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-96 relative cursor-none ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default ParticleTitle;
