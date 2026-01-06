import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  angle: number;
}

interface CosmicParticlesProps {
  count?: number;
  accelerated?: boolean;
  golden?: boolean;
}

export function CosmicParticles({ 
  count = 30, 
  accelerated = false,
  golden = false 
}: CosmicParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.07 + 0.05,
      speed: Math.random() * 0.3 + 0.1,
      angle: Math.random() * 360,
    }));
  }, [count]);

  const baseColor = golden ? "rgb(234, 179, 8)" : "rgb(34, 211, 238)";
  const speedMultiplier = accelerated ? 2.5 : 1;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none z-0"
    >
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            backgroundColor: baseColor,
            opacity: particle.opacity,
            boxShadow: `0 0 ${particle.size * 2}px ${baseColor}`,
          }}
          animate={{
            x: [0, Math.cos(particle.angle * Math.PI / 180) * 50, 0],
            y: [0, Math.sin(particle.angle * Math.PI / 180) * 50, 0],
            opacity: [particle.opacity, particle.opacity * 1.5, particle.opacity],
          }}
          transition={{
            duration: (20 / particle.speed) / speedMultiplier,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
