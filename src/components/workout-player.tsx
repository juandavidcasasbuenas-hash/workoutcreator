"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Workout, WorkoutCompletion, CompletedWorkoutSummary, getZoneColor } from "@/types/workout";
import { TrainerConnectionState, ControlMode, RecordedDataPoint } from "@/types/trainer";
import { downsampleRecordedData, calculateWorkoutSummary } from "@/lib/workout-storage";
import { useTrainer } from "@/hooks/use-trainer";
import { useWorkoutPlayer } from "@/hooks/use-workout-player";
import { useHeartRateMonitor } from "@/hooks/use-heart-rate-monitor";
import { useFTP } from "@/hooks/use-ftp";
import { useStrava, PendingStravaUpload } from "@/hooks/use-strava";
import { PowerGraph } from "./power-graph";
import { StravaConnectModal } from "./strava-connect-modal";
import { generateTCX, downloadTCX } from "@/lib/tcx-export";
import {
  formatDuration,
  getSegmentTypeName,
  getPowerAsPercentFTP,
  expandRepeatedSegments,
} from "@/lib/workout-utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Bluetooth,
  BluetoothOff,
  BluetoothSearching,
  Zap,
  X,
  AlertTriangle,
  Heart,
  Download,
  ChevronDown,
  Radio,
  Upload,
  CheckCircle,
  Loader2,
  ExternalLink,
  Clock,
  Activity,
  TrendingUp,
  Save,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkoutPlayerProps {
  workout: Workout;
  onExit: () => void;
  onWorkoutComplete?: (completion: WorkoutCompletion) => void;
}

export function WorkoutPlayer({ workout, onExit, onWorkoutComplete }: WorkoutPlayerProps) {
  const [ftp] = useFTP();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showConnectivity, setShowConnectivity] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState<PendingStravaUpload | null>(null);
  const [workoutSummary, setWorkoutSummary] = useState<CompletedWorkoutSummary | null>(null);
  const [showAutoPauseNotice, setShowAutoPauseNotice] = useState(false);
  const workoutStartTimeRef = useRef<Date>(new Date());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Strava hook
  const strava = useStrava();

  // Trainer hook
  const trainer = useTrainer();

  // HR Monitor hook
  const hrMonitor = useHeartRateMonitor();

  // Combined heart rate - prefer HR monitor, fallback to trainer
  const currentHeartRate = hrMonitor.heartRate ?? trainer.metrics.heartRate;

  // Combined metrics with HR monitor data - memoized to prevent unnecessary effect runs
  const combinedMetrics = useMemo(() => ({
    ...trainer.metrics,
    heartRate: currentHeartRate,
  }), [trainer.metrics, currentHeartRate]);

  // Autopause handler
  const handleAutoPause = useCallback(() => {
    setShowAutoPauseNotice(true);
  }, []);

  // Player hook
  const player = useWorkoutPlayer({
    segments: workout.segments,
    ftp,
    onSegmentChange: (index, targetWatts) => {
      console.log(`Segment ${index}: ${targetWatts}W`);
    },
    onWorkoutComplete: (recordedData) => {
      // Create completion object with summary and downsampled data
      const summary = calculateWorkoutSummary(recordedData, ftp);
      setWorkoutSummary(summary); // Store locally for display
      const completion: WorkoutCompletion = {
        completedAt: new Date().toISOString(),
        startedAt: workoutStartTimeRef.current.toISOString(),
        summary,
        recordedData: downsampleRecordedData(recordedData, 5),
      };
      onWorkoutComplete?.(completion);
    },
    setTargetPower: trainer.connectionState === 'connected' ? trainer.setTargetPower : undefined,
    setResistanceMode: trainer.connectionState === 'connected' ? trainer.setResistanceMode : undefined,
    metrics: combinedMetrics,
    onAutoPause: handleAutoPause,
  });

  // Wake Lock - prevent screen from sleeping during workout
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && player.playerState.status === 'playing') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock acquired');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('Wake Lock released');
        } catch (err) {
          console.log('Wake Lock release error:', err);
        }
      }
    };

    if (player.playerState.status === 'playing') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-acquire wake lock on visibility change (when tab becomes visible again)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && player.playerState.status === 'playing') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [player.playerState.status]);

  // Calculate estimated finish time
  const estimatedFinishTime = useMemo(() => {
    if (player.playerState.status !== 'playing' && player.playerState.status !== 'paused') {
      return null;
    }
    const finishDate = new Date(Date.now() + player.remainingTotalTime * 1000);
    return finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [player.remainingTotalTime, player.playerState.status]);

  // Set workout start time when playing begins
  useEffect(() => {
    if (player.playerState.status === 'playing' && player.playerState.elapsedTime < 1) {
      workoutStartTimeRef.current = new Date();
    }
  }, [player.playerState.status, player.playerState.elapsedTime]);

  // TCX Export handler
  const handleExportTCX = useCallback(() => {
    try {
      const expandedSegments = expandRepeatedSegments(workout.segments);
      const tcx = generateTCX({
        workoutName: workout.name,
        startTime: workoutStartTimeRef.current,
        recordedData: player.recordedData,
        segments: expandedSegments,
        ftp,
      });
      const filename = `${workout.name.replace(/[^a-z0-9]/gi, '_')}_${workoutStartTimeRef.current.toISOString().split('T')[0]}.tcx`;
      downloadTCX(tcx, filename);
    } catch (err) {
      console.error('Failed to export TCX:', err);
    }
  }, [workout, player.recordedData, ftp]);

  // Generate TCX data helper
  const generateWorkoutTCX = useCallback(() => {
    const expandedSegments = expandRepeatedSegments(workout.segments);
    return generateTCX({
      workoutName: workout.name,
      startTime: workoutStartTimeRef.current,
      recordedData: player.recordedData,
      segments: expandedSegments,
      ftp,
    });
  }, [workout, player.recordedData, ftp]);

  // Strava upload handler
  const handleStravaUpload = useCallback(async () => {
    if (!strava.isConnected) {
      // Generate TCX data and store it before showing modal
      // This ensures the workout data is preserved if user goes through OAuth
      try {
        const tcx = generateWorkoutTCX();
        const pendingData: PendingStravaUpload = {
          tcxData: tcx,
          name: workout.name,
          description: `Indoor cycling workout completed with BrowserTurbo`,
          workoutId: workout.id, // Include workout ID to restore view after OAuth
          workout: JSON.stringify(workout), // Include full workout for restoration
        };
        setPendingUploadData(pendingData);
        setShowStravaModal(true);
      } catch (err) {
        console.error('Failed to generate TCX for Strava:', err);
      }
      return;
    }

    try {
      const tcx = generateWorkoutTCX();
      await strava.uploadActivity(
        tcx,
        workout.name,
        `Indoor cycling workout completed with BrowserTurbo`
      );
    } catch (err) {
      console.error('Failed to upload to Strava:', err);
    }
  }, [workout, strava, generateWorkoutTCX]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (player.playerState.status === 'playing') {
            player.pause();
            setShowExitConfirm(true);
          } else if (player.playerState.status !== 'completed') {
            player.play();
          }
          break;
        case 'Escape':
          if (player.playerState.status === 'playing' || player.playerState.status === 'paused') {
            player.pause();
            setShowExitConfirm(true);
          } else {
            onExit();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.skipBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.skipForward();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, onExit]);

  // Handle exit
  const handleExit = useCallback(() => {
    if (player.playerState.status === 'playing' || player.playerState.status === 'paused') {
      setShowExitConfirm(true);
    } else {
      trainer.disconnect();
      hrMonitor.disconnect();
      onExit();
    }
  }, [player.playerState.status, trainer, hrMonitor, onExit]);

  const confirmExitWithSave = useCallback(() => {
    // End workout triggers completion callback with recorded data
    player.endWorkout();
    setShowExitConfirm(false);
    // Don't exit yet - let user see completion screen to export/upload
  }, [player]);

  const confirmExitWithoutSave = useCallback(() => {
    player.stop();
    trainer.disconnect();
    hrMonitor.disconnect();
    onExit();
  }, [player, trainer, hrMonitor, onExit]);

  // Get current segment color
  const currentSegmentColor = player.currentSegment
    ? getZoneColor(getPowerAsPercentFTP(player.currentSegment, ftp))
    : "#808080";

  // Connection status icon
  const ConnectionIcon = {
    disconnected: BluetoothOff,
    connecting: BluetoothSearching,
    connected: Bluetooth,
    error: BluetoothOff,
  }[trainer.connectionState];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={handleExit}
              className="p-1.5 sm:p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Exit (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-medium text-sm sm:text-base truncate">{workout.name}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {formatDuration(workout.totalDuration)}
              </p>
            </div>
          </div>

          {/* Step Indicator - minimal, hidden on small screens */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <span className="text-muted-foreground/40">Design</span>
            <span className="font-medium text-foreground">Ride</span>
          </div>

          {/* Connectivity Status Button + Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowConnectivity(!showConnectivity)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  trainer.connectionState === 'connected' ? "bg-green-500" : "bg-muted-foreground/30"
                )} />
                <Bluetooth className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  hrMonitor.connectionState === 'connected' ? "bg-red-500" : "bg-muted-foreground/30"
                )} />
                <Heart className="w-4 h-4 text-muted-foreground" />
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                showConnectivity && "rotate-180"
              )} />
            </button>

            {/* Dropdown Panel */}
            {showConnectivity && (
              <>
                {/* Backdrop to close on click outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowConnectivity(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-72 bg-card rounded-xl shadow-lg border border-border z-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Radio className="w-4 h-4" />
                    <span>Devices</span>
                  </div>

                  {/* Trainer Connection */}
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        trainer.connectionState === 'connected' ? "bg-green-500/10" : "bg-muted"
                      )}>
                        <Bluetooth className={cn(
                          "w-4 h-4",
                          trainer.connectionState === 'connected' ? "text-green-500" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {trainer.connectionState === 'connected' ? trainer.trainerName : 'Smart Trainer'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {trainer.connectionState === 'connected' ? 'Connected' :
                           trainer.connectionState === 'connecting' ? 'Connecting...' :
                           trainer.connectionState === 'error' ? trainer.errorMessage : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    {trainer.connectionState === 'disconnected' || trainer.connectionState === 'error' ? (
                      <button
                        onClick={trainer.connect}
                        disabled={!trainer.isSupported}
                        className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                      >
                        Connect
                      </button>
                    ) : trainer.connectionState === 'connected' ? (
                      <button
                        onClick={trainer.disconnect}
                        className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors flex-shrink-0"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                  </div>

                  {/* HR Monitor Connection */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        hrMonitor.connectionState === 'connected' ? "bg-red-500/10" : "bg-muted"
                      )}>
                        <Heart className={cn(
                          "w-4 h-4",
                          hrMonitor.connectionState === 'connected' ? "text-red-500" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {hrMonitor.connectionState === 'connected' ? hrMonitor.deviceName : 'HR Monitor'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {hrMonitor.connectionState === 'connected' ? 'Connected' :
                           hrMonitor.connectionState === 'connecting' ? 'Connecting...' :
                           hrMonitor.connectionState === 'error' ? hrMonitor.errorMessage : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    {hrMonitor.connectionState === 'disconnected' || hrMonitor.connectionState === 'error' ? (
                      <button
                        onClick={hrMonitor.connect}
                        disabled={!hrMonitor.isSupported}
                        className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
                      >
                        Connect
                      </button>
                    ) : hrMonitor.connectionState === 'connected' ? (
                      <button
                        onClick={hrMonitor.disconnect}
                        className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors flex-shrink-0"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                  </div>

                  {!trainer.isSupported && !hrMonitor.isSupported && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Web Bluetooth not supported
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:py-8">
        {/* Workout Complete - shown at top */}
        {player.playerState.status === 'completed' && (
          <div className="mb-4 lg:mb-6 bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Workout Complete!</h2>
              <p className="text-muted-foreground">
                Great job finishing {workout.name}!
              </p>
            </div>

            {/* Summary Stats */}
            {workoutSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {/* Duration */}
                <div className="bg-background rounded-xl p-4 text-center">
                  <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatDuration(workoutSummary.actualDuration)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Duration</div>
                </div>

                {/* Average Power */}
                <div className="bg-background rounded-xl p-4 text-center">
                  <Zap className="w-5 h-5 mx-auto mb-2 text-yellow-500" />
                  <div className="text-2xl font-semibold tabular-nums">
                    {workoutSummary.avgPower ?? '--'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">W</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Avg Power</div>
                </div>

                {/* Normalized Power */}
                <div className="bg-background rounded-xl p-4 text-center">
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-blue-500" />
                  <div className="text-2xl font-semibold tabular-nums">
                    {workoutSummary.normalizedPower ?? '--'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">W</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">NP</div>
                </div>

                {/* TSS */}
                <div className="bg-background rounded-xl p-4 text-center">
                  <Activity className="w-5 h-5 mx-auto mb-2 text-green-500" />
                  <div className="text-2xl font-semibold tabular-nums">
                    {workoutSummary.actualTSS ?? '--'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">TSS</div>
                </div>
              </div>
            )}

            {/* Secondary stats row */}
            {workoutSummary && (workoutSummary.avgCadence || workoutSummary.avgHeartRate || workoutSummary.maxPower) && (
              <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground mb-6">
                {workoutSummary.maxPower && (
                  <span>Max Power: <span className="font-medium text-foreground">{workoutSummary.maxPower}W</span></span>
                )}
                {workoutSummary.avgCadence && (
                  <span>Avg Cadence: <span className="font-medium text-foreground">{workoutSummary.avgCadence} rpm</span></span>
                )}
                {workoutSummary.avgHeartRate && (
                  <span>Avg HR: <span className="font-medium text-foreground">{workoutSummary.avgHeartRate} bpm</span></span>
                )}
                {workoutSummary.maxHeartRate && (
                  <span>Max HR: <span className="font-medium text-foreground">{workoutSummary.maxHeartRate} bpm</span></span>
                )}
              </div>
            )}

            {/* Peak Powers */}
            {workoutSummary && workoutSummary.peakPowers && workoutSummary.peakPowers.length > 0 && (
              <div className="mb-6 pt-6 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Peak Power
                </div>
                <div className="flex flex-wrap gap-2">
                  {workoutSummary.peakPowers.map((peak) => {
                    const label = peak.duration < 60
                      ? `${peak.duration}s`
                      : peak.duration < 3600
                        ? `${peak.duration / 60}m`
                        : `${peak.duration / 3600}h`;
                    return (
                      <div
                        key={peak.duration}
                        className="bg-background rounded-lg px-3 py-2 text-center min-w-[70px]"
                      >
                        <div className="text-lg font-semibold tabular-nums">{peak.power}<span className="text-xs font-normal text-muted-foreground">W</span></div>
                        <div className="text-[10px] text-muted-foreground">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strava upload status */}
            {strava.uploadStatus === 'success' && strava.activityUrl && (
              <div className="mb-4 bg-[#FC4C02]/10 border border-[#FC4C02]/30 rounded-lg p-3 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#FC4C02]" />
                <span className="text-sm text-[#FC4C02]">Uploaded to Strava!</span>
                <a
                  href={strava.activityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#FC4C02] underline flex items-center gap-1 hover:opacity-80"
                >
                  View Activity
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {strava.uploadStatus === 'error' && strava.uploadError && (
              <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{strava.uploadError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleExportTCX}
                disabled={player.recordedData.length === 0}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export TCX
              </button>

              {/* Strava button - different states */}
              {strava.uploadStatus === 'success' ? (
                <button
                  disabled
                  className="px-6 py-3 bg-[#FC4C02]/20 text-[#FC4C02] rounded-lg font-medium flex items-center justify-center gap-2 cursor-default"
                >
                  <CheckCircle className="w-4 h-4" />
                  Sent to Strava
                </button>
              ) : strava.uploadStatus === 'uploading' || strava.uploadStatus === 'processing' ? (
                <button
                  disabled
                  className="px-6 py-3 bg-[#FC4C02] text-white rounded-lg font-medium flex items-center justify-center gap-2 opacity-80"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {strava.uploadStatus === 'uploading' ? 'Uploading...' : 'Processing...'}
                </button>
              ) : (
                <button
                  onClick={handleStravaUpload}
                  disabled={player.recordedData.length === 0}
                  className="px-6 py-3 bg-[#FC4C02] text-white rounded-lg font-medium hover:bg-[#e04502] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {strava.isConnected ? 'Send to Strava' : 'Connect & Send to Strava'}
                </button>
              )}

              <button
                onClick={handleExit}
                className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Desktop/Landscape Layout */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Left Column - Graph & Segment Info (main focus) */}
          <div className="flex-1 flex flex-col gap-4 lg:gap-6 min-w-0">
            {/* Power Graph with Progress - Primary focus area */}
            <div className="bg-card rounded-2xl p-4 sm:p-6 shadow-sm flex-1">
              <PowerGraph
                segments={player.expandedSegments}
                ftp={ftp}
                playerMode={true}
                currentTime={player.playerState.elapsedTime}
                realTimePower={trainer.metrics.power}
                highlightedIndex={player.playerState.currentSegmentIndex}
                recordedData={player.recordedData}
              />

              {/* Compact Controls Bar - Under graph */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                {/* Left: Time elapsed / total + remaining */}
                <div className="text-sm tabular-nums text-muted-foreground">
                  <span>
                    {formatDuration(Math.floor(player.playerState.elapsedTime))}
                    <span className="mx-1">/</span>
                    {formatDuration(workout.totalDuration)}
                  </span>
                  {player.remainingTotalTime > 0 && (
                    <span className="ml-3 text-xs">
                      <span className="opacity-60">-</span>{formatDuration(Math.floor(player.remainingTotalTime))}
                      {estimatedFinishTime && (
                        <span className="opacity-60 ml-2">done {estimatedFinishTime}</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Center: Playback controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={player.skipBackward}
                    disabled={player.playerState.status === 'stopped'}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Previous segment (←)"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  {player.playerState.status === 'playing' ? (
                    <button
                      onClick={() => {
                        player.pause();
                        setShowExitConfirm(true);
                      }}
                      className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      title="Pause (Space)"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={player.play}
                      disabled={player.playerState.status === 'completed'}
                      className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                      title="Play (Space)"
                    >
                      <Play className="w-5 h-5 ml-0.5" />
                    </button>
                  )}

                  <button
                    onClick={player.skipForward}
                    disabled={player.playerState.status === 'stopped'}
                    className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Next segment (→)"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Right: Mode toggle */}
                <div className="flex rounded-lg overflow-hidden border border-border">
                  <button
                    onClick={() => player.setControlMode('erg')}
                    disabled={trainer.connectionState !== 'connected'}
                    className={cn(
                      "px-2 py-1 text-xs font-medium transition-colors flex items-center gap-1",
                      player.playerState.controlMode === 'erg'
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      trainer.connectionState !== 'connected' && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <Zap className="w-3 h-3" />
                    ERG
                  </button>
                  <button
                    onClick={() => player.setControlMode('manual')}
                    className={cn(
                      "px-2 py-1 text-xs font-medium transition-colors",
                      player.playerState.controlMode === 'manual'
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    Manual
                  </button>
                </div>
              </div>
            </div>

            {/* Current Segment Info */}
            <div className="bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-8 sm:h-10 rounded-full"
                    style={{ backgroundColor: currentSegmentColor }}
                  />
                  <div>
                    <div className="font-semibold text-sm sm:text-base">
                      {player.currentSegment
                        ? getSegmentTypeName(player.currentSegment.type)
                        : 'Ready'}
                    </div>
                    <div className="text-xs sm:text-sm opacity-60">
                      Segment {player.playerState.currentSegmentIndex + 1} of{' '}
                      {player.expandedSegments.length}
                    </div>
                  </div>
                </div>

                {/* Segment Timer */}
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold tabular-nums">
                    {formatDuration(Math.ceil(player.remainingSegmentTime))}
                  </div>
                  <div className="text-xs uppercase tracking-wide opacity-60">remaining</div>
                </div>
              </div>

              {/* Segment Progress Bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${player.segmentProgress * 100}%`,
                    backgroundColor: currentSegmentColor,
                  }}
                />
              </div>

              {/* Instructions */}
              {player.currentSegment?.instructions && (
                <p className="mt-3 sm:mt-4 text-sm opacity-70 italic">
                  {player.currentSegment.instructions}
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Metrics (sidebar on desktop) */}
          <div className="lg:w-72 xl:w-80 flex flex-col gap-4 lg:gap-6">
            {/* Power Display - Horizontal on mobile, vertical stack on desktop */}
            <div className="grid grid-cols-4 lg:grid-cols-1 gap-3 lg:gap-4">
              {/* Target Power */}
              <div className="bg-card rounded-2xl p-3 sm:p-4 lg:p-5 text-center shadow-sm">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Target</div>
                <div
                  className="text-2xl sm:text-3xl lg:text-4xl font-semibold tabular-nums"
                  style={{ color: currentSegmentColor }}
                >
                  {player.playerState.targetPower}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">watts</div>
              </div>

              {/* Actual Power */}
              <div className="bg-card rounded-2xl p-3 sm:p-4 lg:p-5 text-center shadow-sm">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Power</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold tabular-nums">
                  {trainer.metrics.power !== null ? trainer.metrics.power : '--'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">watts</div>
              </div>

              {/* Cadence */}
              <div className="bg-card rounded-2xl p-3 sm:p-4 lg:p-5 text-center shadow-sm">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Cadence</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold tabular-nums">
                  {trainer.metrics.cadence !== null ? trainer.metrics.cadence : '--'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">rpm</div>
              </div>

              {/* Heart Rate */}
              <div className="bg-card rounded-2xl p-3 sm:p-4 lg:p-5 text-center shadow-sm">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center justify-center gap-1">
                  <Heart className="w-3 h-3" />
                  <span>HR</span>
                </div>
                <div className={cn(
                  "text-2xl sm:text-3xl lg:text-4xl font-semibold tabular-nums",
                  currentHeartRate !== null && "text-red-500"
                )}>
                  {currentHeartRate !== null ? currentHeartRate : '--'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">bpm</div>
              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Auto-pause Notice */}
      {showAutoPauseNotice && player.isAutoPaused && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border p-6 max-w-sm mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <Pause className="w-6 h-6" />
              <h3 className="text-lg font-semibold">Workout Paused</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              No pedalling detected. The workout has been automatically paused.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAutoPauseNotice(false);
                  player.play();
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
              <button
                onClick={() => {
                  setShowAutoPauseNotice(false);
                  setShowExitConfirm(true);
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
              >
                End Workout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4 text-amber-500">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold">End Workout?</h3>
            </div>
            {player.recordedData.length > 0 ? (
              <>
                <p className="text-muted-foreground mb-2">
                  You have {formatDuration(Math.floor(player.playerState.elapsedTime))} of workout data recorded.
                </p>
                <p className="text-muted-foreground mb-6">
                  Would you like to save this workout or discard it?
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setShowExitConfirm(false);
                      player.play();
                    }}
                    className="flex-1 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={confirmExitWithSave}
                    className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save & End
                  </button>
                  <button
                    onClick={confirmExitWithoutSave}
                    className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-6">
                  Are you sure you want to exit? No workout data has been recorded yet.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowExitConfirm(false);
                      player.play();
                    }}
                    className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={confirmExitWithoutSave}
                    className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Exit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Strava Connect Modal */}
      {showStravaModal && (
        <StravaConnectModal
          onClose={() => {
            setShowStravaModal(false);
            setPendingUploadData(null);
          }}
          pendingUpload={pendingUploadData ?? undefined}
        />
      )}
    </div>
  );
}

