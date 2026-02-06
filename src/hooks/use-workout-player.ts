"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Segment } from "@/types/workout";
import { PlayerState, ControlMode, RecordedDataPoint, TrainerMetrics } from "@/types/trainer";
import { expandRepeatedSegments } from "@/lib/workout-utils";

interface UseWorkoutPlayerProps {
  segments: Segment[];
  ftp: number;
  onSegmentChange?: (index: number, targetWatts: number) => void;
  onWorkoutComplete?: (recordedData: RecordedDataPoint[]) => void;
  setTargetPower?: (watts: number) => Promise<boolean>;
  setResistanceMode?: (level: number) => Promise<boolean>;
  metrics?: TrainerMetrics;
  onAutoPause?: () => void;
}

interface UseWorkoutPlayerReturn {
  playerState: PlayerState;
  expandedSegments: Segment[];
  currentSegment: Segment | null;
  segmentProgress: number; // 0-1 progress within current segment
  workoutProgress: number; // 0-1 progress of total workout
  remainingSegmentTime: number;
  remainingTotalTime: number;
  recordedData: RecordedDataPoint[];
  isAutoPaused: boolean;
  intensityOffset: number; // percentage offset, e.g. 5 means +5%
  play: () => void;
  pause: () => void;
  stop: () => void;
  endWorkout: () => void; // End early and trigger completion with recorded data
  skipForward: () => void;
  skipBackward: () => void;
  setControlMode: (mode: ControlMode) => void;
  adjustIntensity: (delta: number) => void;
}

export function useWorkoutPlayer({
  segments,
  ftp,
  onSegmentChange,
  onWorkoutComplete,
  setTargetPower,
  setResistanceMode,
  metrics,
  onAutoPause,
}: UseWorkoutPlayerProps): UseWorkoutPlayerReturn {
  const expandedSegments = expandRepeatedSegments(segments);
  const totalDuration = expandedSegments.reduce((sum, seg) => sum + seg.duration, 0);

  const [playerState, setPlayerState] = useState<PlayerState>({
    status: 'stopped',
    elapsedTime: 0,
    currentSegmentIndex: 0,
    segmentElapsedTime: 0,
    controlMode: 'erg',
    targetPower: 0,
  });

  const [recordedData, setRecordedData] = useState<RecordedDataPoint[]>([]);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [intensityOffset, setIntensityOffset] = useState(0); // percentage points

  // Refs for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completionCalledRef = useRef<boolean>(false);

  // Refs for autopause detection
  const zeroPowerStartRef = useRef<number | null>(null);
  const AUTOPAUSE_DELAY_MS = 5000; // 5 seconds of no pedalling to autopause

  // Refs to avoid stale closures in intervals
  const playerStateRef = useRef(playerState);
  const metricsRef = useRef(metrics);

  // Keep refs in sync
  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // Autopause detection - pause if no power/cadence for AUTOPAUSE_DELAY_MS
  useEffect(() => {
    if (playerState.status !== 'playing') {
      zeroPowerStartRef.current = null;
      return;
    }

    // Only check if we have real trainer data (not dummy data)
    const hasPowerData = metrics?.power !== null && metrics?.power !== undefined;
    const hasCadenceData = metrics?.cadence !== null && metrics?.cadence !== undefined;

    // If no trainer connected, don't autopause
    if (!hasPowerData && !hasCadenceData) {
      zeroPowerStartRef.current = null;
      return;
    }

    const isIdle = (metrics?.power === 0 || metrics?.power === null) &&
                   (metrics?.cadence === 0 || metrics?.cadence === null);

    if (isIdle) {
      if (zeroPowerStartRef.current === null) {
        zeroPowerStartRef.current = Date.now();
      } else if (Date.now() - zeroPowerStartRef.current >= AUTOPAUSE_DELAY_MS) {
        // Autopause
        setIsAutoPaused(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (recordIntervalRef.current) {
          clearInterval(recordIntervalRef.current);
          recordIntervalRef.current = null;
        }
        setPlayerState((prev) => ({ ...prev, status: 'paused' }));
        onAutoPause?.();
        zeroPowerStartRef.current = null;
      }
    } else {
      zeroPowerStartRef.current = null;
    }
  }, [metrics, playerState.status, onAutoPause]);

  const intensityOffsetRef = useRef(intensityOffset);
  useEffect(() => {
    intensityOffsetRef.current = intensityOffset;
  }, [intensityOffset]);

  // Calculate target power for a segment at a given progress point
  const calculateTargetPower = useCallback(
    (segment: Segment, progress: number): number => {
      const startPower = segment.targetPower.value;
      const endPower = segment.targetPower.valueHigh ?? startPower;

      // Linear interpolation for ramps, then apply intensity offset
      const percentFTP = startPower + (endPower - startPower) * progress;
      const adjustedPercent = percentFTP + intensityOffsetRef.current;
      return Math.max(0, Math.round((adjustedPercent / 100) * ftp));
    },
    [ftp]
  );

  // Get cumulative duration up to a segment index
  const getCumulativeDuration = useCallback(
    (upToIndex: number): number => {
      return expandedSegments
        .slice(0, upToIndex)
        .reduce((sum, seg) => sum + seg.duration, 0);
    },
    [expandedSegments]
  );

  // Find segment index and elapsed time for a given total elapsed time
  const findSegmentAtTime = useCallback(
    (totalElapsed: number): { index: number; segmentElapsed: number } => {
      let accumulated = 0;
      for (let i = 0; i < expandedSegments.length; i++) {
        const segmentEnd = accumulated + expandedSegments[i].duration;
        if (totalElapsed < segmentEnd) {
          return {
            index: i,
            segmentElapsed: totalElapsed - accumulated,
          };
        }
        accumulated = segmentEnd;
      }
      // Workout complete
      return {
        index: expandedSegments.length - 1,
        segmentElapsed: expandedSegments[expandedSegments.length - 1]?.duration || 0,
      };
    },
    [expandedSegments]
  );

  // Update target power when segment or progress changes
  useEffect(() => {
    if (playerState.status !== 'playing' && playerState.status !== 'paused') {
      return;
    }

    const segment = expandedSegments[playerState.currentSegmentIndex];
    if (!segment) return;

    const progress = segment.duration > 0 ? playerState.segmentElapsedTime / segment.duration : 0;
    const targetWatts = calculateTargetPower(segment, progress);

    if (targetWatts !== playerState.targetPower) {
      setPlayerState((prev) => ({ ...prev, targetPower: targetWatts }));

      // Send to trainer if in ERG mode
      if (playerState.controlMode === 'erg' && setTargetPower) {
        setTargetPower(targetWatts);
      }
    }
  }, [
    playerState.currentSegmentIndex,
    playerState.segmentElapsedTime,
    playerState.status,
    playerState.controlMode,
    playerState.targetPower,
    expandedSegments,
    calculateTargetPower,
    setTargetPower,
    intensityOffset,
  ]);

  // Main timer tick
  const tick = useCallback(() => {
    const now = Date.now();
    const deltaSeconds = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    setPlayerState((prev) => {
      if (prev.status !== 'playing') return prev;

      const newElapsedTime = prev.elapsedTime + deltaSeconds;
      const { index, segmentElapsed } = findSegmentAtTime(newElapsedTime);

      // Check for workout completion
      if (newElapsedTime >= totalDuration) {
        return {
          ...prev,
          status: 'completed',
          elapsedTime: totalDuration,
          currentSegmentIndex: expandedSegments.length - 1,
          segmentElapsedTime: expandedSegments[expandedSegments.length - 1]?.duration || 0,
        };
      }

      // Check for segment change
      if (index !== prev.currentSegmentIndex) {
        const segment = expandedSegments[index];
        if (segment) {
          const progress = segment.duration > 0 ? segmentElapsed / segment.duration : 0;
          const targetWatts = calculateTargetPower(segment, progress);
          onSegmentChange?.(index, targetWatts);
        }
      }

      return {
        ...prev,
        elapsedTime: newElapsedTime,
        currentSegmentIndex: index,
        segmentElapsedTime: segmentElapsed,
      };
    });
  }, [expandedSegments, findSegmentAtTime, totalDuration, calculateTargetPower, onSegmentChange]);

  // Handle workout completion
  useEffect(() => {
    if (playerState.status === 'completed' && !completionCalledRef.current) {
      completionCalledRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
      onWorkoutComplete?.(recordedData);
    }
  }, [playerState.status, recordedData, onWorkoutComplete]);

  // Generate realistic dummy data for testing when no trainer connected
  const generateDummyData = useCallback((targetPower: number) => {
    // Power: varies around target with some noise and lag
    const powerVariation = (Math.random() - 0.5) * 30; // ±15W variation
    const powerLag = (Math.random() - 0.5) * 10; // slight lag behind target
    const dummyPower = Math.max(0, Math.round(targetPower + powerVariation + powerLag));

    // Heart rate: correlates with power, ranges 100-170 based on effort
    const effortRatio = targetPower / ftp; // 0 to ~1.2
    const baseHR = 80 + effortRatio * 80; // 80-160 base
    const hrVariation = (Math.random() - 0.5) * 10; // ±5 bpm variation
    const dummyHR = Math.round(Math.min(190, Math.max(70, baseHR + hrVariation)));

    // Cadence: typically 80-100 rpm
    const dummyCadence = Math.round(85 + (Math.random() - 0.5) * 20);

    return { power: dummyPower, heartRate: dummyHR, cadence: dummyCadence };
  }, [ftp]);

  // Record data points (uses refs to avoid stale closure in interval)
  const recordDataPoint = useCallback(() => {
    const state = playerStateRef.current;
    const currentMetrics = metricsRef.current;

    if (state.status !== 'playing') return;

    // Use real metrics if available, otherwise generate dummy data for testing
    const hasRealData = currentMetrics?.power !== null || currentMetrics?.heartRate !== null;
    const dummyData = !hasRealData ? generateDummyData(state.targetPower) : null;

    const dataPoint: RecordedDataPoint = {
      timestamp: Date.now(),
      elapsedTime: state.elapsedTime,
      targetPower: state.targetPower,
      actualPower: currentMetrics?.power ?? dummyData?.power ?? null,
      cadence: currentMetrics?.cadence ?? dummyData?.cadence ?? null,
      heartRate: currentMetrics?.heartRate ?? dummyData?.heartRate ?? null,
      segmentIndex: state.currentSegmentIndex,
    };

    setRecordedData((prev) => [...prev, dataPoint]);
  }, [generateDummyData]);

  // Play
  const play = useCallback(() => {
    setIsAutoPaused(false);
    zeroPowerStartRef.current = null;

    if (playerState.status === 'completed') {
      // Restart from beginning
      completionCalledRef.current = false;
      setPlayerState({
        status: 'playing',
        elapsedTime: 0,
        currentSegmentIndex: 0,
        segmentElapsedTime: 0,
        controlMode: playerState.controlMode,
        targetPower: 0,
      });
      setRecordedData([]);
    } else {
      setPlayerState((prev) => ({ ...prev, status: 'playing' }));
    }

    lastTickRef.current = Date.now();

    // Start main timer (1 second intervals)
    if (!timerRef.current) {
      timerRef.current = setInterval(tick, 1000);
    }

    // Start recording (every 1 second)
    if (!recordIntervalRef.current) {
      recordIntervalRef.current = setInterval(recordDataPoint, 1000);
    }

    // Trigger initial segment change callback
    const segment = expandedSegments[playerState.currentSegmentIndex];
    if (segment) {
      const progress = segment.duration > 0 ? playerState.segmentElapsedTime / segment.duration : 0;
      const targetWatts = calculateTargetPower(segment, progress);
      onSegmentChange?.(playerState.currentSegmentIndex, targetWatts);

      // Send initial target to trainer
      if (playerState.controlMode === 'erg' && setTargetPower) {
        setTargetPower(targetWatts);
      }
    }
  }, [
    playerState,
    tick,
    recordDataPoint,
    expandedSegments,
    calculateTargetPower,
    onSegmentChange,
    setTargetPower,
  ]);

  // Pause
  const pause = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    setPlayerState((prev) => ({ ...prev, status: 'paused' }));
  }, []);

  // Stop
  const stop = useCallback(() => {
    completionCalledRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    setPlayerState({
      status: 'stopped',
      elapsedTime: 0,
      currentSegmentIndex: 0,
      segmentElapsedTime: 0,
      controlMode: playerState.controlMode,
      targetPower: 0,
    });
    // Don't clear recorded data - might want to export partial workout
  }, [playerState.controlMode]);

  // End workout early (triggers completion with current recorded data)
  const endWorkout = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    // Mark as completed to trigger the completion callback
    setPlayerState((prev) => ({
      ...prev,
      status: 'completed',
    }));
  }, []);

  // Skip forward to next segment
  const skipForward = useCallback(() => {
    const nextIndex = playerState.currentSegmentIndex + 1;
    if (nextIndex >= expandedSegments.length) {
      // End of workout
      setPlayerState((prev) => ({
        ...prev,
        status: 'completed',
        elapsedTime: totalDuration,
        currentSegmentIndex: expandedSegments.length - 1,
        segmentElapsedTime: expandedSegments[expandedSegments.length - 1]?.duration || 0,
      }));
      return;
    }

    const newElapsedTime = getCumulativeDuration(nextIndex);
    setPlayerState((prev) => ({
      ...prev,
      elapsedTime: newElapsedTime,
      currentSegmentIndex: nextIndex,
      segmentElapsedTime: 0,
    }));

    const segment = expandedSegments[nextIndex];
    if (segment) {
      const targetWatts = calculateTargetPower(segment, 0);
      onSegmentChange?.(nextIndex, targetWatts);
      if (playerState.controlMode === 'erg' && setTargetPower) {
        setTargetPower(targetWatts);
      }
    }
  }, [
    playerState,
    expandedSegments,
    totalDuration,
    getCumulativeDuration,
    calculateTargetPower,
    onSegmentChange,
    setTargetPower,
  ]);

  // Skip backward to previous segment
  const skipBackward = useCallback(() => {
    // If we're more than 3 seconds into current segment, restart it
    if (playerState.segmentElapsedTime > 3) {
      const newElapsedTime = getCumulativeDuration(playerState.currentSegmentIndex);
      setPlayerState((prev) => ({
        ...prev,
        elapsedTime: newElapsedTime,
        segmentElapsedTime: 0,
      }));

      const segment = expandedSegments[playerState.currentSegmentIndex];
      if (segment) {
        const targetWatts = calculateTargetPower(segment, 0);
        onSegmentChange?.(playerState.currentSegmentIndex, targetWatts);
        if (playerState.controlMode === 'erg' && setTargetPower) {
          setTargetPower(targetWatts);
        }
      }
      return;
    }

    // Otherwise go to previous segment
    const prevIndex = Math.max(0, playerState.currentSegmentIndex - 1);
    const newElapsedTime = getCumulativeDuration(prevIndex);
    setPlayerState((prev) => ({
      ...prev,
      elapsedTime: newElapsedTime,
      currentSegmentIndex: prevIndex,
      segmentElapsedTime: 0,
    }));

    const segment = expandedSegments[prevIndex];
    if (segment) {
      const targetWatts = calculateTargetPower(segment, 0);
      onSegmentChange?.(prevIndex, targetWatts);
      if (playerState.controlMode === 'erg' && setTargetPower) {
        setTargetPower(targetWatts);
      }
    }
  }, [
    playerState,
    expandedSegments,
    getCumulativeDuration,
    calculateTargetPower,
    onSegmentChange,
    setTargetPower,
  ]);

  // Default resistance level for manual mode (0-100%)
  // 50% provides moderate resistance suitable for most trainers
  const DEFAULT_MANUAL_RESISTANCE = 50;

  // Set control mode
  const setControlMode = useCallback(
    (mode: ControlMode) => {
      setPlayerState((prev) => {
        // If switching to ERG and currently playing, send current target
        if (mode === 'erg' && prev.status === 'playing' && setTargetPower) {
          setTargetPower(prev.targetPower).catch((err) => {
            console.error('Failed to set target power on mode switch:', err);
          });
        }

        // If switching to manual mode, set trainer to resistance mode
        if (mode === 'manual' && setResistanceMode) {
          setResistanceMode(DEFAULT_MANUAL_RESISTANCE).catch((err) => {
            console.error('Failed to set resistance mode:', err);
          });
        }

        return { ...prev, controlMode: mode };
      });
    },
    [setTargetPower, setResistanceMode]
  );

  // Adjust intensity offset by a delta (e.g. +5 or -5 percentage points)
  const adjustIntensity = useCallback(
    (delta: number) => {
      setIntensityOffset((prev) => {
        const next = prev + delta;
        // Clamp so the offset doesn't go below -(lowest segment %) — but a simple floor at -50 is safe
        return Math.max(-50, Math.min(50, next));
      });
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
      }
    };
  }, []);

  // Calculate derived values
  const currentSegment = expandedSegments[playerState.currentSegmentIndex] || null;
  const segmentProgress = currentSegment
    ? Math.min(1, playerState.segmentElapsedTime / currentSegment.duration)
    : 0;
  const workoutProgress = totalDuration > 0 ? Math.min(1, playerState.elapsedTime / totalDuration) : 0;
  const remainingSegmentTime = currentSegment
    ? Math.max(0, currentSegment.duration - playerState.segmentElapsedTime)
    : 0;
  const remainingTotalTime = Math.max(0, totalDuration - playerState.elapsedTime);

  return {
    playerState,
    expandedSegments,
    currentSegment,
    segmentProgress,
    workoutProgress,
    remainingSegmentTime,
    remainingTotalTime,
    recordedData,
    isAutoPaused,
    intensityOffset,
    play,
    pause,
    stop,
    endWorkout,
    skipForward,
    skipBackward,
    setControlMode,
    adjustIntensity,
  };
}
