import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef } from "react";

interface BlackHoleCoreProps {
  intensity: number;
  status: string;
}

export function BlackHoleCore({ intensity, status }: BlackHoleCoreProps) {
  const controls = useAnimation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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

      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, size, size);

      const outerRadius = size * 0.46;
      const innerRadius = size * 0.22;

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.9)";
      ctx.lineWidth = 6;
      ctx.shadowBlur = 40;
      ctx.shadowColor = "rgba(0, 240, 255, 0.8)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
      ctx.lineWidth = 12;
      ctx.shadowBlur = 60;
      ctx.shadowColor = "rgba(0, 240, 255, 0.5)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.40, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 200, 230, 0.5)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(0, 240, 255, 0.4)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.35, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 180, 210, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(0, 240, 255, 0.3)";
      ctx.stroke();

      ctx.shadowBlur = 0;

      const highlights = [
        { angle: time * 0.3, size: 20 },
        { angle: time * 0.3 + Math.PI * 0.7, size: 15 },
        { angle: time * 0.3 + Math.PI * 1.4, size: 18 },
        { angle: time * 0.3 + Math.PI * 0.3, size: 12 },
      ];

      highlights.forEach((h) => {
        const x = centerX + Math.cos(h.angle) * outerRadius;
        const y = centerY + Math.sin(h.angle) * outerRadius;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, h.size);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        gradient.addColorStop(0.3, "rgba(0, 240, 255, 0.7)");
        gradient.addColorStop(1, "rgba(0, 240, 255, 0)");
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, h.size, 0, Math.PI * 2);
        ctx.fill();
      });

      const blackHoleGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, innerRadius * 1.5
      );
      blackHoleGradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      blackHoleGradient.addColorStop(0.7, "rgba(0, 0, 0, 1)");
      blackHoleGradient.addColorStop(1, "rgba(0, 20, 30, 0.8)");
      
      ctx.fillStyle = blackHoleGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fill();

      time += 0.015;
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
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.12) 0%, transparent 60%)",
          filter: "blur(50px)",
        }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        className="absolute inset-0 w-full h-full"
      />

      {isWinning && (
        <motion.div
          className="absolute inset-[38%] rounded-full z-10"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.5, 1],
            opacity: [0, 1, 0.9],
          }}
          transition={{
            duration: 1.2,
            ease: "easeOut"
          }}
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(0,240,255,0.6) 40%, transparent 100%)",
            boxShadow: "0 0 80px rgba(0,240,255,1), 0 0 120px rgba(255,255,255,0.6)",
          }}
        />
      )}
    </div>
  );
}
