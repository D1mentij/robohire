"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

export interface LabelSpriteProps {
  title: string;
  subtitle?: string;
  position: [number, number, number];
  accentColor: string;
  bgColor?: string;
  isActive?: boolean;
  scale?: [number, number, number];
}

export function LabelSprite({
  title,
  subtitle,
  position,
  accentColor,
  bgColor = "rgba(15, 23, 42, 0.9)",
  isActive = false,
  scale = [1.85, 0.68, 1],
}: LabelSpriteProps) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pad = 16;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    const r = 28;

    // Background pill/card
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, h, r);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Border
    ctx.lineWidth = isActive ? 8 : 5;
    ctx.strokeStyle = isActive ? "#ffffff" : accentColor;
    ctx.stroke();

    // Accent dot or top bar
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(pad + 34, subtitle ? pad + 54 : pad + h / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Title text (auto-shrinks slightly for long model names)
    ctx.fillStyle = "#f8fafc";
    const titleFontPx = title.length > 18 ? 31 : title.length > 14 ? 35 : 40;
    ctx.font = `bold ${titleFontPx}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      title,
      canvas.width / 2 + 10,
      subtitle ? pad + 54 : pad + h / 2,
      w - 76,
    );

    // Subtitle text
    if (subtitle) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 25px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(subtitle, canvas.width / 2, pad + 114, w - 40);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [title, subtitle, accentColor, bgColor, isActive]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <sprite
      position={position}
      scale={
        isActive
          ? [scale[0] * 1.08, scale[1] * 1.08, scale[2]]
          : scale
      }
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}
