import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef } from "react";

interface BlackHoleCoreProps {
  intensity: number;
  status: string;
}

export function BlackHoleCore({ intensity, status }: BlackHoleCoreProps) {
  const controls = useAnimation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const isActive = status === 'OPEN' || status === 'LOCKED';
  const isWinning = status === 'WINNER' || status === 'RANDOMNESS';

  useEffect(() => {
    controls.start({
      rotate: 360,
      transition: {
        duration: isWinning ? 2 : 20 - (intensity * 15),
        ease: "linear",
        repeat: Infinity,
      }
    });
  }, [intensity, isWinning, controls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const centerX = size / 2;
    const centerY = size / 2;
    let animationFrame: number;
    let time = 0;

    const drawBlackHole = () => {
      ctx.clearRect(0, 0, size, size);

      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, size / 2
      );
      gradient.addColorStop(0, "rgba(0, 20, 30, 1)");
      gradient.addColorStop(0.3, "rgba(0, 10, 15, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const rings = [
        { radius: size * 0.42, width: 3, opacity: 0.9, speed: 0.5 },
        { radius: size * 0.38, width: 2, opacity: 0.7, speed: 0.7 },
        { radius: size * 0.34, width: 1.5, opacity: 0.5, speed: 0.9 },
        { radius: size * 0.30, width: 1, opacity: 0.3, speed: 1.1 },
      ];

      rings.forEach((ring, index) => {
        const pulseOffset = Math.sin(time * ring.speed + index) * 0.1;
        const currentOpacity = ring.opacity * (0.8 + pulseOffset);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${currentOpacity})`;
        ctx.lineWidth = ring.width;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `rgba(0, 240, 255, ${currentOpacity * 0.8})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      const numGlowPoints = 8;
      for (let i = 0; i < numGlowPoints; i++) {
        const angle = (i / numGlowPoints) * Math.PI * 2 + time * 0.3;
        const radius = size * 0.40;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
        glowGradient.addColorStop(0, "rgba(0, 240, 255, 0.8)");
        glowGradient.addColorStop(0.5, "rgba(0, 240, 255, 0.3)");
        glowGradient.addColorStop(1, "rgba(0, 240, 255, 0)");
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fill();
      }

      const innerGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, size * 0.25
      );
      innerGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      innerGradient.addColorStop(0.7, "rgba(0, 0, 0, 1)");
      innerGradient.addColorStop(1, "rgba(0, 10, 20, 0.9)");
      
      ctx.fillStyle = innerGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.23, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 180, 220, 0.4)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(0, 240, 255, 0.5)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      time += 0.02;
      animationFrame = requestAnimationFrame(drawBlackHole);
    };

    drawBlackHole();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      <motion.div 
        className="absolute inset-[5%] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="absolute inset-0 w-full h-full"
        style={{ mixBlendMode: "screen" }}
      />

      <motion.div
        animate={controls}
        className="absolute inset-[8%] rounded-full"
        style={{
          background: "conic-gradient(from 0deg, transparent 0%, rgba(0,240,255,0.1) 25%, transparent 50%, rgba(0,240,255,0.05) 75%, transparent 100%)",
        }}
      />

      {isWinning && (
        <motion.div
          className="absolute inset-[35%] rounded-full"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.2, 1],
            opacity: [0, 1, 0.8],
          }}
          transition={{
            duration: 1,
            ease: "easeOut"
          }}
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(0,240,255,0.5) 50%, transparent 100%)",
            boxShadow: "0 0 60px rgba(0,240,255,0.8), 0 0 100px rgba(255,255,255,0.5)",
          }}
        />
      )}

      {[...Array(20)].map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const distance = 45 + Math.random() * 10;
        return (
          <motion.div
            key={i}
            className="absolute w-[2px] h-[2px] rounded-full"
            style={{
              left: `${50 + Math.cos(angle) * distance}%`,
              top: `${50 + Math.sin(angle) * distance}%`,
              background: "rgba(0, 240, 255, 0.8)",
              boxShadow: "0 0 4px rgba(0, 240, 255, 0.8)",
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        );
      })}
    </div>
  );
}
