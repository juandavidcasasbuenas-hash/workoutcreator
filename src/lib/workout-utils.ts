import { Segment, Workout, getZoneForPower, POWER_ZONES } from "@/types/workout";

/**
 * Calculate total duration of a workout in seconds
 */
export function calculateTotalDuration(segments: Segment[]): number {
  return segments.reduce((total, segment) => {
    const repeat = segment.repeat || 1;
    return total + segment.duration * repeat;
  }, 0);
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse duration string to seconds
 * Supports: "30", "30s", "5m", "5:00", "1h", "1:30:00"
 */
export function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();

  // Handle HH:MM:SS or MM:SS format
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }

  // Handle unit suffixes
  if (trimmed.endsWith("h")) {
    return parseFloat(trimmed) * 3600;
  }
  if (trimmed.endsWith("m") || trimmed.endsWith("min")) {
    return parseFloat(trimmed) * 60;
  }
  if (trimmed.endsWith("s") || trimmed.endsWith("sec")) {
    return parseFloat(trimmed);
  }

  // Assume minutes if no unit and > 10
  const num = parseFloat(trimmed);
  if (num > 10) {
    return num * 60;
  }
  return num;
}

/**
 * Calculate Normalized Power for a workout
 * Simplified calculation assuming steady power in each segment
 */
export function calculateNormalizedPower(segments: Segment[], ftp: number): number {
  let totalWeightedPower = 0;
  let totalDuration = 0;

  for (const segment of segments) {
    const repeat = segment.repeat || 1;
    const duration = segment.duration * repeat;
    let powerWatts: number;

    if (segment.targetPower.type === "percent_ftp") {
      const avgPercent = segment.targetPower.valueHigh
        ? (segment.targetPower.value + segment.targetPower.valueHigh) / 2
        : segment.targetPower.value;
      powerWatts = (avgPercent / 100) * ftp;
    } else if (segment.targetPower.type === "absolute_watts") {
      powerWatts = segment.targetPower.value;
    } else {
      // Zone-based - use midpoint of zone
      const zone = segment.targetPower.value as keyof typeof POWER_ZONES;
      const zoneData = POWER_ZONES[zone];
      powerWatts = ((zoneData.min + zoneData.max) / 2 / 100) * ftp;
    }

    // Fourth power for NP calculation
    totalWeightedPower += Math.pow(powerWatts, 4) * duration;
    totalDuration += duration;
  }

  if (totalDuration === 0) return 0;
  return Math.pow(totalWeightedPower / totalDuration, 0.25);
}

/**
 * Calculate Intensity Factor (IF = NP / FTP)
 */
export function calculateIntensityFactor(segments: Segment[], ftp: number): number {
  const np = calculateNormalizedPower(segments, ftp);
  return np / ftp;
}

/**
 * Calculate Training Stress Score (TSS)
 * TSS = (duration_hours * NP * IF) / (FTP * 3600) * 100
 */
export function calculateTSS(segments: Segment[], ftp: number): number {
  const duration = calculateTotalDuration(segments);
  const np = calculateNormalizedPower(segments, ftp);
  const intensityFactor = np / ftp;

  return Math.round((duration * np * intensityFactor) / (ftp * 36));
}

/**
 * Get a human-readable description of the workout intensity
 */
export function getIntensityDescription(intensityFactor: number): string {
  if (intensityFactor < 0.75) return "Easy";
  if (intensityFactor < 0.85) return "Moderate";
  if (intensityFactor < 0.95) return "Hard";
  if (intensityFactor < 1.05) return "Very Hard";
  return "Maximal";
}

/**
 * Get power value as percentage of FTP
 */
export function getPowerAsPercentFTP(segment: Segment, ftp: number): number {
  if (segment.targetPower.type === "percent_ftp") {
    return segment.targetPower.value;
  } else if (segment.targetPower.type === "absolute_watts") {
    return (segment.targetPower.value / ftp) * 100;
  } else {
    const zone = segment.targetPower.value as keyof typeof POWER_ZONES;
    const zoneData = POWER_ZONES[zone];
    return (zoneData.min + zoneData.max) / 2;
  }
}

/**
 * Get power value as watts
 */
export function getPowerAsWatts(segment: Segment, ftp: number): number {
  if (segment.targetPower.type === "absolute_watts") {
    return segment.targetPower.value;
  } else if (segment.targetPower.type === "percent_ftp") {
    return Math.round((segment.targetPower.value / 100) * ftp);
  } else {
    const zone = segment.targetPower.value as keyof typeof POWER_ZONES;
    const zoneData = POWER_ZONES[zone];
    return Math.round(((zoneData.min + zoneData.max) / 2 / 100) * ftp);
  }
}

/**
 * Recalculate workout stats
 */
export function recalculateWorkoutStats(workout: Workout, ftp: number): Workout {
  return {
    ...workout,
    totalDuration: calculateTotalDuration(workout.segments),
    estimatedTSS: calculateTSS(workout.segments, ftp),
    intensityFactor: calculateIntensityFactor(workout.segments, ftp),
  };
}

/**
 * Expand repeated segments into individual segments for visualization
 */
export function expandRepeatedSegments(segments: Segment[]): Segment[] {
  const expanded: Segment[] = [];

  for (const segment of segments) {
    const repeat = segment.repeat || 1;
    for (let i = 0; i < repeat; i++) {
      expanded.push({
        ...segment,
        id: `${segment.id}-${i}`,
        repeat: 1,
      });
    }
  }

  return expanded;
}

/**
 * Get segment type display name
 */
export function getSegmentTypeName(type: string): string {
  const names: Record<string, string> = {
    warmup: "Warm Up",
    interval: "Interval",
    recovery: "Recovery",
    cooldown: "Cool Down",
    steady: "Steady State",
  };
  return names[type] || type;
}
