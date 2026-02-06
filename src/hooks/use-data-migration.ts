"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Workout } from "@/types/workout";

const MIGRATION_FLAG = "supabase-migration-done";

export function useDataMigration() {
  const { user, supabase } = useAuth();
  const [hasPendingMigration, setHasPendingMigration] = useState(false);
  const [localWorkoutCount, setLocalWorkoutCount] = useState(0);
  const [isMigrating, setIsMigrating] = useState(false);

  // Check for pending migration when user logs in
  useEffect(() => {
    if (!user) {
      setHasPendingMigration(false);
      return;
    }

    // Already migrated
    if (localStorage.getItem(MIGRATION_FLAG) === user.id) {
      setHasPendingMigration(false);
      return;
    }

    // Check if there's local data to migrate
    try {
      const localWorkouts = localStorage.getItem("workouts");
      const parsed = localWorkouts ? JSON.parse(localWorkouts) : [];
      if (parsed.length > 0) {
        setLocalWorkoutCount(parsed.length);
        setHasPendingMigration(true);
      } else {
        // No data to migrate, mark as done
        localStorage.setItem(MIGRATION_FLAG, user.id);
      }
    } catch {
      localStorage.setItem(MIGRATION_FLAG, user.id);
    }
  }, [user]);

  const migrateAll = useCallback(async () => {
    if (!user) return;
    setIsMigrating(true);

    try {
      // Migrate workouts
      const localWorkoutsRaw = localStorage.getItem("workouts");
      const localWorkouts: Workout[] = localWorkoutsRaw ? JSON.parse(localWorkoutsRaw) : [];

      if (localWorkouts.length > 0) {
        const rows = localWorkouts.map((w) => ({
          id: w.id,
          user_id: user.id,
          name: w.name,
          description: w.description ?? "",
          total_duration: w.totalDuration,
          estimated_tss: w.estimatedTSS,
          intensity_factor: w.intensityFactor,
          segments: w.segments,
          created_at: w.createdAt,
          source: w.source,
          completion: w.completion ?? null,
        }));

        // upsert to avoid conflicts if some were already synced
        const { error } = await supabase.from("workouts").upsert(rows);
        if (error) {
          console.error("Error migrating workouts:", error);
          setIsMigrating(false);
          return;
        }
      }

      // Migrate FTP
      const localFtp = localStorage.getItem("user-ftp");
      if (localFtp) {
        const ftpValue = JSON.parse(localFtp);
        if (typeof ftpValue === "number") {
          await supabase.from("profiles").update({ ftp: ftpValue }).eq("id", user.id);
        }
      }

      // Migrate Strava tokens
      const localStrava = localStorage.getItem("strava-auth");
      if (localStrava) {
        const stravaTokens = JSON.parse(localStrava);
        await supabase
          .from("profiles")
          .update({ strava_tokens: stravaTokens })
          .eq("id", user.id);
      }

      // Mark migration as done
      localStorage.setItem(MIGRATION_FLAG, user.id);
      setHasPendingMigration(false);
    } catch (err) {
      console.error("Migration error:", err);
    } finally {
      setIsMigrating(false);
    }
  }, [user, supabase]);

  const skipMigration = useCallback(() => {
    if (user) {
      localStorage.setItem(MIGRATION_FLAG, user.id);
    }
    setHasPendingMigration(false);
  }, [user]);

  return { hasPendingMigration, localWorkoutCount, migrateAll, skipMigration, isMigrating };
}
