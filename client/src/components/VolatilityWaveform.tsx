import { useEffect, useRef, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface VolatilityWaveformProps {
  initialPrice: number | null;
  currentPrice: number | null;
  className?: string;
  mini?: boolean;
}

export function VolatilityWaveform({ 
  initialPrice, 
  currentPrice, 
  className = "",
  mini = false
}: VolatilityWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothedPercentRef = useRef(0);
  const [displayPercent, setDisplayPercent] = useState(0);

  const priceChangePercent = useMemo(() => {
    if (!initialPrice || !currentPrice || initialPrice === 0) return 0;
    return ((currentPrice - initialPrice) / initialPrice) * 100;
  }, [initialPrice, currentPrice]);

  useEffect(() => {
    const target = priceChangePercent;
    const interval = setInterval(() => {
      const step = (target - smoothedPercentRef.current) * 0.1;
      if (Math.abs(step) > 0.01) {
        smoothedPercentRef.current += step;
        setDisplayPercent(smoothedPercentRef.current);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [priceChangePercent]);

  const trend = useMemo(() => {
    if (displayPercent > 1) return "up";
    if (displayPercent < -1) return "down";
    return "flat";
  }, [displayPercent]);

  const colors = useMemo(() => {
    switch (trend) {
      case "up":
        return {
          primary: "#00ff88",
          secondary: "#00ff8855",
          glow: "rgba(0, 255, 136, 0.3)",
          text: "text-green-400"
        };
      case "down":
        return {
          primary: "#ff4444",
          secondary: "#ff444455",
          glow: "rgba(255, 68, 68, 0.3)",
          text: "text-red-400"
        };
      default:
        return {
          primary: "#00f0ff",
          secondary: "#00f0ff55",
          glow: "rgba(0, 240, 255, 0.3)",
          text: "text-cyan-400"
        };
    }
  }, [trend]);

  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    const animate = () => {
      const currentColors = colorsRef.current;
      const amplitude = Math.min(Math.abs(smoothedPercentRef.current) * 1.5, 40);
      const baseAmplitude = mini ? 3 : 5;
      const effectiveAmplitude = baseAmplitude + amplitude;
      const currentTrend = smoothedPercentRef.current > 1 ? "up" : smoothedPercentRef.current < -1 ? "down" : "flat";
      const direction = currentTrend === "down" ? -1 : 1;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, width, height);

      ctx.shadowBlur = 15;
      ctx.shadowColor = currentColors.glow;

      ctx.beginPath();
      ctx.strokeStyle = currentColors.secondary;
      ctx.lineWidth = mini ? 1 : 2;

      for (let x = 0; x < width; x++) {
        const frequency1 = 0.02;
        const frequency2 = 0.05;
        const frequency3 = 0.08;
        
        const wave1 = Math.sin((x * frequency1) + phaseRef.current) * effectiveAmplitude * 0.6;
        const wave2 = Math.sin((x * frequency2) + phaseRef.current * 1.3) * effectiveAmplitude * 0.3;
        const wave3 = Math.sin((x * frequency3) + phaseRef.current * 0.7) * effectiveAmplitude * 0.1;
        
        const combinedWave = (wave1 + wave2 + wave3) * direction;
        const y = centerY + combinedWave;
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = currentColors.primary;
      ctx.lineWidth = mini ? 1.5 : 2.5;

      for (let x = 0; x < width; x++) {
        const frequency1 = 0.025;
        const frequency2 = 0.06;
        
        const wave1 = Math.sin((x * frequency1) + phaseRef.current * 1.1) * effectiveAmplitude * 0.7;
        const wave2 = Math.sin((x * frequency2) + phaseRef.current * 0.9) * effectiveAmplitude * 0.2;
        
        const combinedWave = (wave1 + wave2) * direction;
        const y = centerY + combinedWave;
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.shadowBlur = 0;

      const speed = 0.02 + (Math.abs(smoothedPercentRef.current) * 0.002);
      phaseRef.current += speed;
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mini]);

  if (!initialPrice || initialPrice === 0) {
    return null;
  }

  if (!currentPrice || currentPrice === 0) {
    return (
      <div className={`bg-zinc-900/60 p-6 rounded-2xl backdrop-blur-xl shadow-2xl ${className}`}>
        <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.4em] opacity-60">
          Volatility Pulse
        </div>
        <div className="text-sm text-muted-foreground mt-2">Awaiting price data...</div>
      </div>
    );
  }

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  if (mini) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="volatility-waveform-mini">
        <canvas
          ref={canvasRef}
          width={60}
          height={24}
          className="rounded"
          data-testid="canvas-waveform"
        />
        <span className={`text-xs font-mono font-bold ${colors.text}`} data-testid="text-volatility-percent">
          {formatPercent(displayPercent)}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`bg-zinc-900/60 p-6 rounded-2xl backdrop-blur-xl shadow-2xl ${className}`}
      data-testid="volatility-waveform"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.4em] opacity-60">
          Volatility Pulse
        </div>
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.6, 1, 0.6]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <TrendIcon className={`w-4 h-4 ${colors.text}`} />
        </motion.div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={180}
          height={60}
          className="w-full rounded-lg"
          style={{ 
            filter: `drop-shadow(0 0 10px ${colors.glow})` 
          }}
          data-testid="canvas-waveform"
        />
        
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-transparent to-zinc-900/80 pointer-events-none rounded-lg" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <motion.span
          key={trend}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-3xl font-mono font-black ${colors.text}`}
          style={{
            textShadow: `0 0 20px ${colors.glow}`
          }}
          data-testid="text-volatility-percent"
        >
          {formatPercent(displayPercent)}
        </motion.span>
        
        <div className="text-[9px] font-tech text-muted-foreground uppercase tracking-widest opacity-60">
          vs. Pool Start
        </div>
      </div>
    </motion.div>
  );
}
