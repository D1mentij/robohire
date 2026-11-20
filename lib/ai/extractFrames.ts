export type ExtractOptions = {
  count?: number;
  maxSide?: number;
  quality?: number;
  onProgress?: (done: number, total: number) => void;
};

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("Could not read video frame")); };
    const cleanup = () => {
      video.removeEventListener("seeked", ok);
      video.removeEventListener("error", bad);
    };
    video.addEventListener("seeked", ok);
    video.addEventListener("error", bad);
    video.currentTime = time;
  });
}

/** Load a video file and return its metadata (duration in seconds). */
export function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported or unreadable video file"));
    };
    video.src = url;
  });
}

/** Extract `count` evenly spaced JPEG frames (data URLs) from a video file, in the browser. */
export async function extractFrames(file: File, opts: ExtractOptions = {}): Promise<string[]> {
  const { count = 8, maxSide = 768, quality = 0.7, onProgress } = opts;
  const { video, url } = await loadVideo(file);
  try {
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error("Could not determine video duration");
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      // centre of each of `count` equal segments
      await seek(video, Math.min(duration - 0.05, ((i + 0.5) / count) * duration));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", quality));
      onProgress?.(i + 1, count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
