"use client";

import { Workout } from "@/types/workout";
import { formatDuration } from "@/lib/workout-utils";
import { Clock, Trash2, Zap, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentWorkoutsProps {
  workouts: Workout[];
  onLoad: (workout: Workout) => void;
  onDelete: (id: string) => void;
}

export function RecentWorkouts({ workouts, onLoad, onDelete }: RecentWorkoutsProps) {
  if (workouts.length === 0) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Recent</h2>
      <div className="space-y-2">
        {workouts.map((workout) => {
          const isCompleted = !!workout.completion;
          const summary = workout.completion?.summary;

          return (
            <div
              key={workout.id}
              className={cn(
                "bg-card rounded-xl py-3 sm:py-4 px-4 sm:px-5 hover:shadow-md transition-shadow cursor-pointer group shadow-sm",
                isCompleted && "border border-green-500/30 bg-green-500/5"
              )}
              onClick={() => onLoad(workout)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isCompleted && (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    <h3 className="font-medium truncate text-sm sm:text-base">{workout.name}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {isCompleted && summary
                        ? formatDuration(summary.actualDuration)
                        : formatDuration(workout.totalDuration)}
                    </span>
                    {isCompleted && summary?.avgPower ? (
                      <>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {summary.avgPower}W avg
                        </span>
                        {summary.actualTSS !== null && (
                          <span className="text-green-600">TSS {summary.actualTSS}</span>
                        )}
                      </>
                    ) : (
                      <span>TSS {workout.estimatedTSS}</span>
                    )}
                    <span>
                      {isCompleted && workout.completion
                        ? formatDate(workout.completion.completedAt)
                        : formatDate(workout.createdAt)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(workout.id);
                  }}
                  className="p-2 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
