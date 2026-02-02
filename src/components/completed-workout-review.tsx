"use client";

import { useCallback } from "react";
import { Workout } from "@/types/workout";
import { UseStravaReturn, PendingStravaUpload } from "@/hooks/use-strava";
import { useFTP } from "@/hooks/use-ftp";
import { PowerGraph } from "./power-graph";
import { expandRepeatedSegments, formatDuration } from "@/lib/workout-utils";
import { generateTCX, downloadTCX } from "@/lib/tcx-export";
import {
  CheckCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
  Download,
  Upload,
  Clock,
  Zap,
  Activity,
  Heart,
  TrendingUp,
  Play,
} from "lucide-react";

interface CompletedWorkoutReviewProps {
  workout: Workout;
  strava: UseStravaReturn;
  onBack: () => void;
  onStravaConnect?: (pendingUpload: PendingStravaUpload) => void;
  onDoAgain?: () => void;
}

export function CompletedWorkoutReview({
  workout,
  strava,
  onBack,
  onStravaConnect,
  onDoAgain,
}: CompletedWorkoutReviewProps) {
  const [ftp] = useFTP();
  const completion = workout.completion;
  const summary = completion?.summary;

  // Expand segments for the power graph
  const expandedSegments = expandRepeatedSegments(workout.segments);

  // TCX Export handler
  const handleExportTCX = useCallback(() => {
    if (!completion) return;

    try {
      const tcx = generateTCX({
        workoutName: workout.name,
        startTime: new Date(completion.startedAt),
        recordedData: completion.recordedData,
        segments: expandedSegments,
        ftp,
      });
      const filename = `${workout.name.replace(/[^a-z0-9]/gi, '_')}_${new Date(completion.completedAt).toISOString().split('T')[0]}.tcx`;
      downloadTCX(tcx, filename);
    } catch (err) {
      console.error('Failed to export TCX:', err);
    }
  }, [workout, completion, expandedSegments, ftp]);

  // Strava upload handler
  const handleStravaUpload = useCallback(async () => {
    if (!completion) return;

    try {
      const tcx = generateTCX({
        workoutName: workout.name,
        startTime: new Date(completion.startedAt),
        recordedData: completion.recordedData,
        segments: expandedSegments,
        ftp,
      });

      if (!strava.isConnected) {
        // Not connected, trigger OAuth flow with pending upload
        const pendingUpload: PendingStravaUpload = {
          tcxData: tcx,
          name: workout.name,
          description: `Indoor cycling workout completed with BrowserTurbo`,
          workoutId: workout.id,
          workout: JSON.stringify(workout),
        };
        onStravaConnect?.(pendingUpload);
        return;
      }

      await strava.uploadActivity(
        tcx,
        workout.name,
        `Indoor cycling workout completed with BrowserTurbo`
      );
    } catch (err) {
      console.error('Failed to upload to Strava:', err);
    }
  }, [workout, completion, expandedSegments, ftp, strava, onStravaConnect]);

  // Format date nicely
  const formatCompletedDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (!completion) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No completion data available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                {workout.name}
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                Completed {formatCompletedDate(completion.completedAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 sm:gap-2 text-green-500">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm font-medium hidden sm:inline">Completed</span>
            </div>
            {onDoAgain && (
              <button
                onClick={onDoAgain}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity text-xs sm:text-sm"
              >
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Do Again</span>
                <span className="sm:hidden">Redo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-8">
        {/* Summary Stats */}
        <div className="bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Workout Summary
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {/* Duration */}
            <div className="bg-background rounded-xl p-3 sm:p-4 text-center">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1.5 sm:mb-2 text-muted-foreground" />
              <div className="text-lg sm:text-2xl font-semibold tabular-nums">
                {summary ? formatDuration(summary.actualDuration) : '--'}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">Duration</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground/60">
                Planned: {formatDuration(workout.totalDuration)}
              </div>
            </div>

            {/* Average Power */}
            <div className="bg-background rounded-xl p-3 sm:p-4 text-center">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1.5 sm:mb-2 text-yellow-500" />
              <div className="text-lg sm:text-2xl font-semibold tabular-nums">
                {summary?.avgPower ?? '--'}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">W</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">Avg Power</div>
              {summary?.maxPower && (
                <div className="text-[10px] sm:text-xs text-muted-foreground/60">
                  Max: {summary.maxPower}W
                </div>
              )}
            </div>

            {/* Normalized Power */}
            <div className="bg-background rounded-xl p-3 sm:p-4 text-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1.5 sm:mb-2 text-blue-500" />
              <div className="text-lg sm:text-2xl font-semibold tabular-nums">
                {summary?.normalizedPower ?? '--'}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">W</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">Normalized</div>
              {summary?.normalizedPower && ftp > 0 && (
                <div className="text-[10px] sm:text-xs text-muted-foreground/60">
                  IF: {(summary.normalizedPower / ftp).toFixed(2)}
                </div>
              )}
            </div>

            {/* TSS */}
            <div className="bg-background rounded-xl p-3 sm:p-4 text-center">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1.5 sm:mb-2 text-green-500" />
              <div className="text-lg sm:text-2xl font-semibold tabular-nums text-green-600">
                {summary?.actualTSS ?? '--'}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">TSS</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground/60">
                Planned: {workout.estimatedTSS}
              </div>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-3 sm:mt-4">
            {/* Cadence */}
            <div className="bg-background rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-lg font-semibold tabular-nums">
                {summary?.avgCadence ?? '--'}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">rpm</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Avg Cadence</div>
            </div>

            {/* Heart Rate */}
            <div className="bg-background rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-lg font-semibold tabular-nums">
                {summary?.avgHeartRate ?? '--'}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">bpm</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Avg HR</div>
            </div>

            {/* Max HR */}
            <div className="bg-background rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-lg font-semibold tabular-nums">
                {summary?.maxHeartRate ?? '--'}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">bpm</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Max HR</div>
            </div>

            {/* FTP Reference */}
            <div className="bg-background rounded-xl p-2.5 sm:p-3 text-center">
              <div className="text-base sm:text-lg font-semibold tabular-nums">
                {ftp}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">W</span>
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">FTP</div>
            </div>
          </div>

          {/* Peak Powers */}
          {summary?.peakPowers && summary.peakPowers.length > 0 && (
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-border">
              <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 sm:mb-3">
                Peak Power
              </div>
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                {summary.peakPowers.map((peak) => {
                  const label = peak.duration < 60
                    ? `${peak.duration}s`
                    : peak.duration < 3600
                      ? `${peak.duration / 60}m`
                      : `${peak.duration / 3600}h`;
                  return (
                    <div
                      key={peak.duration}
                      className="bg-background rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-center sm:min-w-[70px]"
                    >
                      <div className="text-base sm:text-lg font-semibold tabular-nums">
                        {peak.power}
                        <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">W</span>
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground">{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Power Graph */}
        <div className="bg-card rounded-2xl p-3 sm:p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Power Analysis
          </h2>
          <PowerGraph
            segments={expandedSegments}
            ftp={ftp}
            height={250}
            recordedData={completion.recordedData}
          />
        </div>

        {/* Export Actions */}
        <div className="bg-card rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Export & Share
          </h2>

          {/* Strava Status */}
          {strava.uploadStatus === 'success' && (
            <div className="mb-4 bg-[#FC4C02]/10 border border-[#FC4C02]/30 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#FC4C02]" />
                <span className="text-sm text-[#FC4C02]">Uploaded to Strava</span>
              </div>
              {strava.activityUrl && (
                <a
                  href={strava.activityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#FC4C02] underline flex items-center gap-1 hover:opacity-80"
                >
                  View Activity
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {strava.uploadStatus === 'error' && strava.uploadError && (
            <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">{strava.uploadError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {/* TCX Export */}
            <button
              onClick={handleExportTCX}
              disabled={completion.recordedData.length === 0}
              className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export TCX
            </button>

            {/* Strava Upload */}
            {strava.uploadStatus === 'success' ? (
              <button
                disabled
                className="flex-1 px-6 py-3 bg-[#FC4C02]/20 text-[#FC4C02] rounded-lg font-medium flex items-center justify-center gap-2 cursor-default"
              >
                <CheckCircle className="w-4 h-4" />
                Sent to Strava
              </button>
            ) : strava.uploadStatus === 'uploading' || strava.uploadStatus === 'processing' ? (
              <button
                disabled
                className="flex-1 px-6 py-3 bg-[#FC4C02] text-white rounded-lg font-medium flex items-center justify-center gap-2 opacity-80"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                {strava.uploadStatus === 'uploading' ? 'Uploading...' : 'Processing...'}
              </button>
            ) : (
              <button
                onClick={handleStravaUpload}
                disabled={completion.recordedData.length === 0}
                className="flex-1 px-6 py-3 bg-[#FC4C02] text-white rounded-lg font-medium hover:bg-[#e04502] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {strava.isConnected ? 'Send to Strava' : 'Connect & Send to Strava'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
