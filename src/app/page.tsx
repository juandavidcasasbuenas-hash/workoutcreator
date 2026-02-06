"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkoutCreator } from "@/components/workout-creator";
import { WorkoutView } from "@/components/workout-view";
import { WorkoutPlayer } from "@/components/workout-player";
import { CompletedWorkoutReview } from "@/components/completed-workout-review";
import { StravaConnectModal } from "@/components/strava-connect-modal";
import { RecentWorkouts } from "@/components/recent-workouts";
import { SettingsModal } from "@/components/settings-modal";
import { FTPSetup } from "@/components/ftp-setup";
import { Workout, WorkoutCompletion, generateId } from "@/types/workout";
import { useStrava, PendingStravaUpload } from "@/hooks/use-strava";
import { useAuth } from "@/components/auth-provider";
import { useWorkouts } from "@/hooks/use-workouts";
import { useRawFTP } from "@/hooks/use-ftp";
import { useDataMigration } from "@/hooks/use-data-migration";

function HomeWithCallback() {
  const [currentWorkout, setCurrentWorkout] = useState<Workout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [pendingStravaUpload, setPendingStravaUpload] = useState<PendingStravaUpload | null>(null);
  const { workouts: savedWorkouts, saveWorkout, deleteWorkout } = useWorkouts();
  const [ftp, setFtp] = useRawFTP();
  const [isHydrated, setIsHydrated] = useState(false);
  const strava = useStrava();
  const { user, supabase } = useAuth();
  const migration = useDataMigration();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Wait for hydration to check localStorage
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Handle Strava OAuth callback - tokens come in URL fragment for security
  useEffect(() => {
    // Check URL fragment for auth data (more secure than query params)
    const hash = window.location.hash;
    if (hash.startsWith("#strava_auth=")) {
      const authData = hash.substring("#strava_auth=".length);
      strava.handleAuthCallback(authData);
      // Clear the hash without triggering navigation
      window.history.replaceState(null, "", window.location.pathname);
    }

    // Check query params for errors (these are safe to log)
    const stravaError = searchParams.get("strava_error");
    if (stravaError) {
      console.error("Strava auth error:", stravaError);
      strava.clearPendingUpload();
      router.replace("/", { scroll: false });
    }
  }, [searchParams, router, strava.handleAuthCallback, strava.clearPendingUpload]);

  // Auto-upload pending workout after successful auth and restore workout view
  useEffect(() => {
    if (strava.isConnected && strava.hasPendingUpload && strava.pendingUpload) {
      const pending = strava.pendingUpload;

      // Restore the workout view - try from pending data first, then from saved workouts
      if (pending.workout) {
        try {
          const workout = JSON.parse(pending.workout) as Workout;
          setCurrentWorkout(workout);
          setShowReview(true);

          // Save to recent workouts if not already there
          const existingIndex = savedWorkouts.findIndex(w => w.id === workout.id);
          if (existingIndex < 0) {
            saveWorkout(workout);
          }
        } catch (e) {
          console.error("Error parsing workout from pending upload:", e);
        }
      } else if (pending.workoutId) {
        // Fallback to saved workouts
        const workout = savedWorkouts.find(w => w.id === pending.workoutId);
        if (workout) {
          setCurrentWorkout(workout);
          setShowReview(true);
        }
      }

      // Clear pending upload first to prevent re-triggering, then upload
      // (upload continues in background even if pending data is cleared)
      strava.clearPendingUpload();
      strava.uploadActivity(pending.tcxData, pending.name, pending.description).catch((err) => {
        console.error("Auto-upload failed:", err);
      });
    }
  }, [strava.isConnected, strava.hasPendingUpload, strava.pendingUpload, strava.clearPendingUpload, strava.uploadActivity, savedWorkouts, saveWorkout]);

  const handleFTPComplete = (newFtp: number) => {
    setFtp(newFtp);
  };

  // Show nothing while hydrating to prevent flash
  if (!isHydrated) {
    return null;
  }

  // Show FTP setup if not configured
  if (ftp === null) {
    return <FTPSetup onComplete={handleFTPComplete} />;
  }

  const handleWorkoutCreated = (workout: Workout) => {
    setCurrentWorkout(workout);
  };

  const handleSaveWorkout = (workout: Workout) => {
    saveWorkout(workout);
  };

  const handleLoadWorkout = (workout: Workout) => {
    setCurrentWorkout(workout);
    // Show review mode for completed workouts
    if (workout.completion) {
      setShowReview(true);
    } else {
      setShowReview(false);
    }
  };

  const handleDeleteWorkout = (id: string) => {
    deleteWorkout(id);
    if (currentWorkout?.id === id) {
      setCurrentWorkout(null);
    }
  };

  const handleBack = () => {
    setCurrentWorkout(null);
    setShowReview(false);
  };

  const handleStartWorkout = () => {
    setIsPlaying(true);
  };

  const handleExitPlayer = () => {
    setIsPlaying(false);
    setCurrentWorkout(null);
  };

  const handleDoAgain = () => {
    if (currentWorkout) {
      // Create a fresh copy without completion data
      const freshWorkout: Workout = {
        ...currentWorkout,
        id: generateId(), // New ID for this attempt
        completion: undefined,
        createdAt: new Date().toISOString(),
      };
      setCurrentWorkout(freshWorkout);
      setShowReview(false);
      setIsPlaying(true);
    }
  };

  const handleWorkoutComplete = (completion: WorkoutCompletion) => {
    console.log("Workout completed!", completion.summary);
    // Create a NEW entry for the completed workout, preserving the original plan
    if (currentWorkout) {
      // Create completed workout with new ID to preserve history
      const completedWorkout: Workout = {
        ...currentWorkout,
        id: generateId(), // New ID for this completion
        completion,
      };
      setCurrentWorkout(completedWorkout);

      // Add completed workout to the top of the list
      // The original workout plan (if it exists without completion) stays intact
      saveWorkout(completedWorkout);
    }
  };

  // Show WorkoutPlayer when playing
  if (isPlaying && currentWorkout) {
    return (
      <WorkoutPlayer
        workout={currentWorkout}
        onExit={handleExitPlayer}
        onWorkoutComplete={handleWorkoutComplete}
      />
    );
  }

  // Show review mode for completed workouts
  if (showReview && currentWorkout && currentWorkout.completion) {
    return (
      <>
        <CompletedWorkoutReview
          workout={currentWorkout}
          strava={strava}
          onBack={handleBack}
          onStravaConnect={(pendingUpload) => {
            setPendingStravaUpload(pendingUpload);
            setShowStravaModal(true);
          }}
          onDoAgain={handleDoAgain}
        />
        {showStravaModal && (
          <StravaConnectModal
            onClose={() => {
              setShowStravaModal(false);
              setPendingStravaUpload(null);
            }}
            pendingUpload={pendingStravaUpload ?? undefined}
          />
        )}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-base sm:text-lg font-semibold tracking-tight hover:text-muted-foreground transition-colors"
          >
            <img src="/logo.svg" alt="BrowserTurbo" className="w-7 h-7 sm:w-8 sm:h-8" />
            <span className="hidden sm:inline">BrowserTurbo</span>
          </button>

          {/* Step Indicator - minimal */}
          <div className="flex items-center gap-4 sm:gap-6 text-sm">
            <span className="font-medium text-foreground">Design</span>
            <span className="text-muted-foreground/40">Ride</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {user ? (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[160px]">
                  {user.email}
                </span>
                <button
                  onClick={async () => { await supabase.auth.signOut(); router.refresh(); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <a
                href="/auth"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </a>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {migration.hasPendingMigration && (
        <div className="bg-primary/5 border-b border-primary/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">
              Found <span className="font-semibold">{migration.localWorkoutCount}</span> workout{migration.localWorkoutCount !== 1 ? "s" : ""} saved locally. Import to your account?
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={migration.migrateAll}
                disabled={migration.isMigrating}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {migration.isMigrating ? "Importing..." : "Import All"}
              </button>
              <button
                onClick={migration.skipMigration}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {currentWorkout ? (
          <WorkoutView
            workout={currentWorkout}
            onBack={handleBack}
            onSave={handleSaveWorkout}
            onUpdate={setCurrentWorkout}
            onStartWorkout={handleStartWorkout}
          />
        ) : (
          <div className="space-y-8 sm:space-y-12">
            <WorkoutCreator onWorkoutCreated={handleWorkoutCreated} />
            <RecentWorkouts
              workouts={savedWorkouts}
              onLoad={handleLoadWorkout}
              onDelete={handleDeleteWorkout}
            />
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeWithCallback />
    </Suspense>
  );
}
