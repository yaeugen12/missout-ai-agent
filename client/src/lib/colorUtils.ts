const colorCache = new Map<string, string>();

const FALLBACK_COLORS = [
  "rgba(0, 240, 255, 0.8)",
  "rgba(176, 38, 255, 0.8)",
  "rgba(255, 0, 128, 0.8)",
  "rgba(0, 255, 136, 0.8)",
  "rgba(255, 170, 0, 0.8)",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getTokenAccentColor(tokenSymbol: string, tokenMint?: string): string {
  const key = tokenMint || tokenSymbol;
  
  if (colorCache.has(key)) {
    return colorCache.get(key)!;
  }
  
  const hash = hashString(key);
  const color = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
  colorCache.set(key, color);
  
  return color;
}

export function getTokenGradient(tokenSymbol: string, tokenMint?: string): string {
  const baseColor = getTokenAccentColor(tokenSymbol, tokenMint);
  return `radial-gradient(circle at 70% 30%, ${baseColor.replace("0.8", "0.3")} 0%, transparent 60%)`;
}

export function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          resolve(FALLBACK_COLORS[0]);
          return;
        }
        
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;
        
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 128) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          resolve(`rgba(${r}, ${g}, ${b}, 0.8)`);
        } else {
          resolve(FALLBACK_COLORS[0]);
        }
      } catch {
        resolve(FALLBACK_COLORS[0]);
      }
    };
    
    img.onerror = () => resolve(FALLBACK_COLORS[0]);
    img.src = imageUrl;
  });
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
