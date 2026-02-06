"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLocalStorage } from "./use-local-storage";
import { Workout } from "@/types/workout";

interface DbWorkoutRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  total_duration: number;
  estimated_tss: number;
  intensity_factor: number;
  segments: unknown;
  created_at: string;
  source: string;
  completion: unknown;
}

function dbRowToWorkout(row: DbWorkoutRow): Workout {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    totalDuration: row.total_duration,
    estimatedTSS: row.estimated_tss,
    intensityFactor: row.intensity_factor,
    segments: row.segments as Workout["segments"],
    createdAt: row.created_at,
    source: row.source as Workout["source"],
    completion: (row.completion as Workout["completion"]) ?? undefined,
  };
}

function workoutToDbRow(workout: Workout, userId: string): Omit<DbWorkoutRow, "user_id"> & { user_id: string } {
  return {
    id: workout.id,
    user_id: userId,
    name: workout.name,
    description: workout.description,
    total_duration: workout.totalDuration,
    estimated_tss: workout.estimatedTSS,
    intensity_factor: workout.intensityFactor,
    segments: workout.segments,
    created_at: workout.createdAt,
    source: workout.source,
    completion: workout.completion ?? null,
  };
}

export function useWorkouts() {
  const { user, supabase } = useAuth();
  const [localWorkouts, setLocalWorkouts] = useLocalStorage<Workout[]>("workouts", []);
  const [dbWorkouts, setDbWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch workouts from Supabase when logged in
  useEffect(() => {
    if (!user) {
      setDbWorkouts([]);
      return;
    }

    setIsLoading(true);
    supabase
      .from("workouts")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching workouts:", error);
        } else if (data) {
          setDbWorkouts(data.map((row: DbWorkoutRow) => dbRowToWorkout(row)));
        }
        setIsLoading(false);
      });
  }, [user, supabase]);

  const workouts = user ? dbWorkouts : localWorkouts;

  const saveWorkout = useCallback(
    async (workout: Workout) => {
      if (!user) {
        // localStorage path
        setLocalWorkouts((prev: Workout[]) => {
          const idx = prev.findIndex((w) => w.id === workout.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = workout;
            return updated;
          }
          return [workout, ...prev];
        });
        return;
      }

      // Supabase path — upsert
      const row = workoutToDbRow(workout, user.id);
      const { error } = await supabase.from("workouts").upsert(row);
      if (error) {
        console.error("Error saving workout:", error);
        return;
      }
      // Update local state
      setDbWorkouts((prev) => {
        const idx = prev.findIndex((w) => w.id === workout.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = workout;
          return updated;
        }
        return [workout, ...prev];
      });
    },
    [user, supabase, setLocalWorkouts]
  );

  const deleteWorkout = useCallback(
    async (id: string) => {
      if (!user) {
        setLocalWorkouts((prev: Workout[]) => prev.filter((w) => w.id !== id));
        return;
      }

      const { error } = await supabase.from("workouts").delete().eq("id", id);
      if (error) {
        console.error("Error deleting workout:", error);
        return;
      }
      setDbWorkouts((prev) => prev.filter((w) => w.id !== id));
    },
    [user, supabase, setLocalWorkouts]
  );

  return { workouts, saveWorkout, deleteWorkout, isLoading };
}
