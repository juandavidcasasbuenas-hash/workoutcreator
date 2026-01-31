"use client";

import { CompletedWorkoutSummary } from "@/types/workout";
import { formatDuration } from "@/lib/workout-utils";

export type WorkoutImageType = "summary" | "peaks" | "logo" | "none";

interface GenerateWorkoutImageOptions {
  type: WorkoutImageType;
  workoutName: string;
  summary: CompletedWorkoutSummary;
  ftp: number;
}

/**
 * Generates a workout summary image as a data URL using canvas
 */
export async function generateWorkoutImage(options: GenerateWorkoutImageOptions): Promise<string> {
  const { type, workoutName, summary, ftp } = options;

  const canvas = document.createElement("canvas");
  const size = 1080; // Instagram-friendly square
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Common text styles
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (type === "summary") {
    // Workout name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.fillText(workoutName, size / 2, 120);

    // Stats grid
    const stats = [
      { label: "Duration", value: formatDuration(summary.actualDuration) },
      { label: "Avg Power", value: summary.avgPower ? `${summary.avgPower}W` : "--" },
      { label: "NP", value: summary.normalizedPower ? `${summary.normalizedPower}W` : "--" },
      { label: "TSS", value: summary.actualTSS ? `${summary.actualTSS}` : "--" },
    ];

    const startY = 300;
    const spacing = 180;

    stats.forEach((stat, i) => {
      const y = startY + i * spacing;

      // Value
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 72px system-ui, sans-serif";
      ctx.fillText(stat.value, size / 2, y);

      // Label
      ctx.fillStyle = "#888888";
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillText(stat.label.toUpperCase(), size / 2, y + 50);
    });

    // Branding
    ctx.fillStyle = "#666666";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("BrowserTurbo", size / 2, size - 60);

  } else if (type === "peaks") {
    // Peak power display
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.fillText("Peak Power", size / 2, 120);

    if (summary.peakPowers && summary.peakPowers.length > 0) {
      const startY = 250;
      const spacing = 140;

      summary.peakPowers.slice(0, 5).forEach((peak, i) => {
        const y = startY + i * spacing;
        const label = peak.duration < 60
          ? `${peak.duration}s`
          : peak.duration < 3600
            ? `${peak.duration / 60}m`
            : `${peak.duration / 3600}h`;

        // Power value
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 64px system-ui, sans-serif";
        ctx.fillText(`${peak.power}W`, size / 2, y);

        // Duration label
        ctx.fillStyle = "#888888";
        ctx.font = "28px system-ui, sans-serif";
        ctx.fillText(label, size / 2, y + 45);
      });
    } else {
      ctx.fillStyle = "#666666";
      ctx.font = "32px system-ui, sans-serif";
      ctx.fillText("No peak data available", size / 2, size / 2);
    }

    // Branding
    ctx.fillStyle = "#666666";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("BrowserTurbo", size / 2, size - 60);

  } else if (type === "logo") {
    // Simple logo/branding image
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px system-ui, sans-serif";
    ctx.fillText("BrowserTurbo", size / 2, size / 2 - 40);

    ctx.fillStyle = "#888888";
    ctx.font = "32px system-ui, sans-serif";
    ctx.fillText("AI-Powered Indoor Cycling", size / 2, size / 2 + 40);

    // Workout name at bottom
    ctx.fillStyle = "#666666";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(workoutName, size / 2, size - 100);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Downloads an image from a data URL
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
