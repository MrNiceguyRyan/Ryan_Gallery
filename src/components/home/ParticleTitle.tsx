import React, { useRef, useEffect, useState } from 'react';

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
  const mouse = useRef({ x: 0, y: 0, radius: 100 });
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

    // Split text by <br/> if present
    const lines = text.split('<br/>');
    const lineHeight = fontSize * 0.9;

    lines.forEach((line, index) => {
      ctx.fillText(
        line.replace(/<[^>]*>?/gm, ''),
        dimensions.width / 2,
        dimensions.height / 2 + (index - (lines.length - 1) / 2) * lineHeight
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
          newParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            originX: x,
            originY: y,
            color: 'white',
            size: 1.2,
            vx: 0,
            vy: 0,
            force: 0,
            angle: 0,
            distance: 0,
            friction: 0.92,
            ease: 0.08,
          });
        }
      }
    }
    particles.current = newParticles;

    let animationId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouseX = mouse.current.x;
      const mouseY = mouse.current.y;
      const radius = mouse.current.radius;
      const radiusSq = radius * radius;

      for (let i = 0; i < particles.current.length; i++) {
        const p = particles.current[i];
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq) {
          const distance = Math.sqrt(distSq);
          const force = (radius - distance) / radius;
          const angle = Math.atan2(dy, dx);
          p.vx -= force * Math.cos(angle) * 3.5;
          p.vy -= force * Math.sin(angle) * 3.5;
        }

        p.vx += (p.originX - p.x) * p.ease;
        p.vy += (p.originY - p.y) * p.ease;
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [dimensions, text]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouse.current.x = e.clientX - rect.left;
    mouse.current.y = e.clientY - rect.top;
    if (onHover) onHover(true);
  };

  const handleMouseLeave = () => {
    mouse.current.x = -1000;
    mouse.current.y = -1000;
    if (onHover) onHover(false);
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-96 relative cursor-none ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ParticleTitle;
