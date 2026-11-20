"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

export interface SpeechBubbleSpriteProps {
  text: string;
  position?: [number, number, number];
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  const usedWordsCount = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const remainingWords = words.slice(usedWordsCount).join(" ");
  if (remainingWords) {
    lines.push(remainingWords);
  } else if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

export function SpeechBubbleSprite({
  text,
  position = [0, 2.15, 0],
}: SpeechBubbleSpriteProps) {
  const texture = useMemo(() => {
    if (typeof document === "undefined" || !text.trim()) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 840;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padX = 24;
    const padY = 18;
    const tailHeight = 32;
    const boxW = canvas.width - padX * 2;
    const boxH = canvas.height - padY * 2 - tailHeight;
    const radius = 30;

    // Speech bubble body + downward pointer tail
    ctx.beginPath();
    ctx.roundRect(padX, padY, boxW, boxH, radius);
    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#0ea5e9";
    ctx.stroke();

    // Pointer triangle at bottom center
    const cx = canvas.width / 2;
    const bottomY = padY + boxH;
    ctx.beginPath();
    ctx.moveTo(cx - 22, bottomY - 3);
    ctx.lineTo(cx, bottomY + tailHeight);
    ctx.lineTo(cx + 22, bottomY - 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0ea5e9";
    ctx.stroke();

    // Cover inner seam of triangle
    ctx.beginPath();
    ctx.moveTo(cx - 20, bottomY - 2);
    ctx.lineTo(cx + 20, bottomY - 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.99)";
    ctx.stroke();

    // Header tag inside speech bubble
    ctx.fillStyle = "#0284c7";
    ctx.font = "bold 24px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("K1 SPEAKING", padX + 30, padY + 20);

    // Wrapped spoken text
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 33px system-ui, -apple-system, sans-serif";
    const lines = wrapTextLines(ctx, `"${text}"`, boxW - 60, 3);
    const lineHeight = 44;
    const startY = padY + 62;

    lines.forEach((line, idx) => {
      ctx.fillText(line, padX + 30, startY + idx * lineHeight);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [text]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <sprite position={position} scale={[2.95, 1.05, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}
