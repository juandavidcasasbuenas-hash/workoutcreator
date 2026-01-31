import { RecordedDataPoint } from "@/types/trainer";
import { CompletedWorkoutSummary, PeakPower } from "@/types/workout";

/**
 * Downsample recorded data to 5-second intervals for storage efficiency
 * Reduces ~3600 points/hour to ~720 points/hour (~100KB/hour)
 */
export function downsampleRecordedData(
  data: RecordedDataPoint[],
  intervalSeconds: number = 5
): RecordedDataPoint[] {
  if (data.length === 0) return [];
  if (data.length === 1) return [...data];

  const downsampled: RecordedDataPoint[] = [];
  let bucketStart = 0;
  let bucketPoints: RecordedDataPoint[] = [];

  for (const point of data) {
    const bucketIndex = Math.floor(point.elapsedTime / intervalSeconds);
    const currentBucketStart = bucketIndex * intervalSeconds;

    if (currentBucketStart !== bucketStart && bucketPoints.length > 0) {
      // Average the bucket and add to result
      downsampled.push(averageDataPoints(bucketPoints));
      bucketPoints = [];
      bucketStart = currentBucketStart;
    }

    bucketPoints.push(point);
  }

  // Don't forget the last bucket
  if (bucketPoints.length > 0) {
    downsampled.push(averageDataPoints(bucketPoints));
  }

  return downsampled;
}

/**
 * Average multiple data points into one
 */
function averageDataPoints(points: RecordedDataPoint[]): RecordedDataPoint {
  if (points.length === 0) {
    throw new Error("Cannot average empty array");
  }

  if (points.length === 1) {
    return { ...points[0] };
  }

  const avgElapsedTime = points.reduce((sum, p) => sum + p.elapsedTime, 0) / points.length;
  const avgTargetPower = points.reduce((sum, p) => sum + p.targetPower, 0) / points.length;

  // For nullable values, only average non-null ones
  const powerValues = points.map(p => p.actualPower).filter((v): v is number => v !== null);
  const cadenceValues = points.map(p => p.cadence).filter((v): v is number => v !== null);
  const hrValues = points.map(p => p.heartRate).filter((v): v is number => v !== null);

  return {
    timestamp: points[Math.floor(points.length / 2)].timestamp, // Use middle timestamp
    elapsedTime: Math.round(avgElapsedTime),
    targetPower: Math.round(avgTargetPower),
    actualPower: powerValues.length > 0 ? Math.round(powerValues.reduce((a, b) => a + b, 0) / powerValues.length) : null,
    cadence: cadenceValues.length > 0 ? Math.round(cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length) : null,
    heartRate: hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null,
    segmentIndex: points[points.length - 1].segmentIndex, // Use last segment index
  };
}

/**
 * Calculate workout summary statistics from recorded data
 */
export function calculateWorkoutSummary(
  data: RecordedDataPoint[],
  ftp: number
): CompletedWorkoutSummary {
  if (data.length === 0) {
    return {
      actualDuration: 0,
      avgPower: null,
      maxPower: null,
      avgCadence: null,
      avgHeartRate: null,
      maxHeartRate: null,
      normalizedPower: null,
      actualTSS: null,
      peakPowers: [],
    };
  }

  // Calculate actual duration from elapsed time
  const actualDuration = Math.max(...data.map(p => p.elapsedTime));

  // Filter to valid power readings
  const powerValues = data.map(p => p.actualPower).filter((v): v is number => v !== null && v > 0);
  const cadenceValues = data.map(p => p.cadence).filter((v): v is number => v !== null);
  const hrValues = data.map(p => p.heartRate).filter((v): v is number => v !== null);

  const avgPower = powerValues.length > 0
    ? Math.round(powerValues.reduce((a, b) => a + b, 0) / powerValues.length)
    : null;

  const maxPower = powerValues.length > 0
    ? Math.max(...powerValues)
    : null;

  const avgCadence = cadenceValues.length > 0
    ? Math.round(cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length)
    : null;

  const avgHeartRate = hrValues.length > 0
    ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
    : null;

  const maxHeartRate = hrValues.length > 0
    ? Math.max(...hrValues)
    : null;

  // Calculate Normalized Power (NP) using 30-second rolling average
  const normalizedPower = calculateNormalizedPower(data);

  // Calculate actual TSS
  const actualTSS = normalizedPower !== null && ftp > 0
    ? calculateTSS(normalizedPower, actualDuration, ftp)
    : null;

  // Calculate peak powers for various durations
  const peakPowers = calculatePeakPowers(data, actualDuration);

  return {
    actualDuration,
    avgPower,
    maxPower,
    avgCadence,
    avgHeartRate,
    maxHeartRate,
    normalizedPower,
    actualTSS,
    peakPowers,
  };
}

/**
 * Calculate Normalized Power using 30-second rolling average
 * NP = fourth root of average of (30-sec rolling avg power)^4
 */
function calculateNormalizedPower(data: RecordedDataPoint[]): number | null {
  const powerValues = data
    .filter(p => p.actualPower !== null && p.actualPower > 0)
    .map(p => ({ time: p.elapsedTime, power: p.actualPower as number }));

  if (powerValues.length < 30) {
    // Not enough data for proper NP calculation, return average power
    if (powerValues.length === 0) return null;
    return Math.round(powerValues.reduce((sum, p) => sum + p.power, 0) / powerValues.length);
  }

  // Create 30-second rolling averages
  const rollingAverages: number[] = [];

  for (let i = 0; i < powerValues.length; i++) {
    const windowStart = powerValues[i].time - 30;
    const windowPoints = powerValues.filter(p => p.time > windowStart && p.time <= powerValues[i].time);

    if (windowPoints.length > 0) {
      const avg = windowPoints.reduce((sum, p) => sum + p.power, 0) / windowPoints.length;
      rollingAverages.push(avg);
    }
  }

  if (rollingAverages.length === 0) return null;

  // Calculate fourth power average
  const fourthPowerAvg = rollingAverages.reduce((sum, p) => sum + Math.pow(p, 4), 0) / rollingAverages.length;

  // Take fourth root
  const np = Math.pow(fourthPowerAvg, 0.25);

  return Math.round(np);
}

/**
 * Calculate Training Stress Score (TSS)
 * TSS = (duration_seconds * NP * IF) / (FTP * 3600) * 100
 * where IF (Intensity Factor) = NP / FTP
 */
function calculateTSS(normalizedPower: number, durationSeconds: number, ftp: number): number {
  const intensityFactor = normalizedPower / ftp;
  const tss = (durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600) * 100;
  return Math.round(tss);
}

/**
 * Calculate best (peak) power for a specific duration
 * Uses a sliding window approach to find the highest average power
 */
function calculatePeakPower(data: RecordedDataPoint[], durationSeconds: number): number | null {
  // Need at least the duration's worth of data points
  const powerValues = data
    .filter(p => p.actualPower !== null && p.actualPower > 0)
    .map(p => ({ time: p.elapsedTime, power: p.actualPower as number }));

  if (powerValues.length === 0) return null;

  // For very short durations (< 5s), just return max power
  if (durationSeconds <= 5) {
    return Math.max(...powerValues.map(p => p.power));
  }

  let maxAvgPower = 0;

  // Sliding window to find best average
  for (let i = 0; i < powerValues.length; i++) {
    const windowEnd = powerValues[i].time;
    const windowStart = windowEnd - durationSeconds;

    // Get all points in the window
    const windowPoints = powerValues.filter(p => p.time > windowStart && p.time <= windowEnd);

    // Only consider if we have enough data in the window (at least 80% coverage)
    if (windowPoints.length >= durationSeconds * 0.8) {
      const avgPower = windowPoints.reduce((sum, p) => sum + p.power, 0) / windowPoints.length;
      maxAvgPower = Math.max(maxAvgPower, avgPower);
    }
  }

  return maxAvgPower > 0 ? Math.round(maxAvgPower) : null;
}

/**
 * Calculate peak powers for standard time intervals
 * Returns only intervals that have enough data
 */
function calculatePeakPowers(data: RecordedDataPoint[], workoutDuration: number): PeakPower[] {
  // Standard intervals: 5s, 30s, 1min, 5min, 10min, 20min, 30min, 60min
  const intervals = [
    { duration: 5, label: "5s" },
    { duration: 30, label: "30s" },
    { duration: 60, label: "1min" },
    { duration: 300, label: "5min" },
    { duration: 600, label: "10min" },
    { duration: 1200, label: "20min" },
    { duration: 1800, label: "30min" },
    { duration: 3600, label: "60min" },
  ];

  const peakPowers: PeakPower[] = [];

  for (const interval of intervals) {
    // Only calculate if workout is long enough for this interval
    if (workoutDuration >= interval.duration) {
      const power = calculatePeakPower(data, interval.duration);
      if (power !== null) {
        peakPowers.push({ duration: interval.duration, power });
      }
    }
  }

  return peakPowers;
}
