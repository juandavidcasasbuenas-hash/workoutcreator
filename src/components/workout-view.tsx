"use client";

import { useState, useRef, useEffect } from "react";
import { Workout, Segment, getZoneColor, generateId } from "@/types/workout";
import {
  formatDuration,
  getPowerAsPercentFTP,
  getPowerAsWatts,
  getSegmentTypeName,
  expandRepeatedSegments,
  recalculateWorkoutStats,
  parseDuration,
} from "@/lib/workout-utils";
import { useFTP } from "@/hooks/use-ftp";
import { PowerGraph } from "./power-graph";
import { ExportMenu } from "./export-menu";
import { ArrowLeft, Save, Edit2, Check, X, Trash2, Plus, Minus, Clock, Zap, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkoutViewProps {
  workout: Workout;
  onBack: () => void;
  onSave: (workout: Workout) => void;
  onUpdate: (workout: Workout) => void;
  onStartWorkout?: () => void;
}

export function WorkoutView({ workout, onBack, onSave, onUpdate, onStartWorkout }: WorkoutViewProps) {
  const [ftp] = useFTP();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(workout.name);
  const [isSaved, setIsSaved] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState<number | null>(null);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const expandedSegments = expandRepeatedSegments(workout.segments);

  // Create mapping from expanded index to original segment index
  const expandedToOriginalMap: number[] = [];
  // Create reverse mapping from original index to first expanded index
  const originalToExpandedMap: number[] = [];
  let expandedIdx = 0;
  workout.segments.forEach((segment, originalIndex) => {
    originalToExpandedMap.push(expandedIdx);
    const repeat = segment.repeat || 1;
    for (let i = 0; i < repeat; i++) {
      expandedToOriginalMap.push(originalIndex);
      expandedIdx++;
    }
  });

  const handleGraphSegmentClick = (expandedIndex: number) => {
    const originalIndex = expandedToOriginalMap[expandedIndex];
    if (originalIndex === undefined) return;

    const segment = workout.segments[originalIndex];
    if (!segment) return;

    // Highlight the segment on the graph
    setHighlightedSegmentIndex(expandedIndex);

    // Only open editor if already in edit mode
    if (showQuickEdit) {
      setEditingSegmentId(segment.id);
    }

    // Scroll to the segment after a short delay
    setTimeout(() => {
      const ref = segmentRefs.current.get(segment.id);
      if (ref) {
        ref.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleSave = () => {
    onSave(workout);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleNameSave = () => {
    if (editedName.trim()) {
      const updated = { ...workout, name: editedName.trim() };
      onUpdate(updated);
    }
    setIsEditingName(false);
  };

  const handleSegmentUpdate = (index: number, updates: Partial<Segment>) => {
    const newSegments = [...workout.segments];
    newSegments[index] = { ...newSegments[index], ...updates };
    const updated = recalculateWorkoutStats(
      { ...workout, segments: newSegments },
      ftp
    );
    onUpdate(updated);
    setEditingSegmentId(null);
  };

  const handleDeleteSegment = (index: number) => {
    if (workout.segments.length <= 1) return;
    const newSegments = workout.segments.filter((_, i) => i !== index);
    const updated = recalculateWorkoutStats(
      { ...workout, segments: newSegments },
      ftp
    );
    onUpdate(updated);
  };

  const handleAddSegment = (afterIndex: number) => {
    const newSegment: Segment = {
      id: generateId(),
      type: "steady",
      duration: 300,
      targetPower: { type: "percent_ftp", value: 75 },
    };
    const newSegments = [...workout.segments];
    newSegments.splice(afterIndex + 1, 0, newSegment);
    const updated = recalculateWorkoutStats(
      { ...workout, segments: newSegments },
      ftp
    );
    onUpdate(updated);
    setEditingSegmentId(newSegment.id);
  };

  const handleScaleWorkout = (factor: number) => {
    const newSegments = workout.segments.map((seg) => ({
      ...seg,
      duration: Math.max(30, Math.round(seg.duration * factor)),
    }));
    const updated = recalculateWorkoutStats(
      { ...workout, segments: newSegments },
      ftp
    );
    onUpdate(updated);
  };

  const handleScalePower = (delta: number) => {
    const newSegments = workout.segments.map((seg) => ({
      ...seg,
      targetPower: {
        ...seg.targetPower,
        value: Math.max(30, Math.min(200, seg.targetPower.value + delta)),
        valueHigh: seg.targetPower.valueHigh
          ? Math.max(30, Math.min(200, seg.targetPower.valueHigh + delta))
          : undefined,
      },
    }));
    const updated = recalculateWorkoutStats(
      { ...workout, segments: newSegments },
      ftp
    );
    onUpdate(updated);
  };

  return (
    <div className={cn(
      "max-w-4xl mx-auto space-y-6 transition-all duration-300",
      showQuickEdit && "ring-2 ring-primary/30 ring-offset-4 ring-offset-background rounded-xl p-2"
    )}>
      {/* Edit Mode Banner */}
      {showQuickEdit && (
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" />
            <span className="font-medium">Edit Mode Active</span>
            <span className="text-primary-foreground/70 text-sm">— Click segments to modify them</span>
          </div>
          <button
            onClick={() => setShowQuickEdit(false)}
            className="p-1 hover:bg-primary-foreground/20 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {onStartWorkout && (
            <button
              onClick={onStartWorkout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors font-medium"
            >
              <Play className="w-4 h-4" />
              <span>Start Workout</span>
            </button>
          )}
          <button
            onClick={() => setShowQuickEdit(!showQuickEdit)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 border",
              showQuickEdit
                ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "border-border hover:bg-accent"
            )}
          >
            <Edit2 className={cn("w-4 h-4", showQuickEdit && "animate-pulse")} />
            <span>{showQuickEdit ? "Editing" : "Edit workout"}</span>
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              isSaved
                ? "bg-green-500 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
          <ExportMenu workout={workout} ftp={ftp} />
        </div>
      </div>

      {/* Quick Edit Panel */}
      {showQuickEdit && (
        <div className="bg-primary/5 rounded-lg border-2 border-primary/20 p-4 animate-in fade-in-0 duration-300">
          <h3 className="font-medium mb-3 text-primary">Quick Adjustments</h3>
          <div className="flex flex-wrap gap-4">
            {/* Duration scaling */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Duration:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleScaleWorkout(0.75)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  -25%
                </button>
                <button
                  onClick={() => handleScaleWorkout(0.9)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  -10%
                </button>
                <button
                  onClick={() => handleScaleWorkout(1.1)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  +10%
                </button>
                <button
                  onClick={() => handleScaleWorkout(1.25)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  +25%
                </button>
              </div>
            </div>

            {/* Power scaling */}
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Intensity:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleScalePower(-10)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  -10%
                </button>
                <button
                  onClick={() => handleScalePower(-5)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  -5%
                </button>
                <button
                  onClick={() => handleScalePower(5)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  +5%
                </button>
                <button
                  onClick={() => handleScalePower(10)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                >
                  +10%
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workout title */}
      <div className="bg-card text-card-foreground rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 text-xl font-semibold bg-transparent border-b-2 border-primary focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
              />
              <button
                onClick={handleNameSave}
                className="p-1.5 text-green-600 hover:bg-green-600/10 rounded"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setEditedName(workout.name);
                  setIsEditingName(false);
                }}
                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold">{workout.name}</h2>
              <button
                onClick={() => setIsEditingName(true)}
                className="p-1 opacity-50 hover:opacity-100 rounded transition-opacity"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        {workout.description && (
          <p className="text-sm opacity-70">{workout.description}</p>
        )}
      </div>

      {/* Power Graph */}
      <div className="bg-surface rounded-xl p-5 sticky top-2 z-10">
        <div className="mb-3">
          <span className="text-xs text-muted-foreground">Click on the graph to jump to a segment</span>
        </div>
        <PowerGraph
          segments={expandedSegments}
          ftp={ftp}
          onSegmentClick={handleGraphSegmentClick}
          highlightedIndex={highlightedSegmentIndex}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card text-card-foreground rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">
            {formatDuration(workout.totalDuration)}
          </div>
          <div className="text-xs uppercase tracking-wide opacity-60 mt-1">Duration</div>
        </div>
        <div className="bg-card text-card-foreground rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{workout.estimatedTSS}</div>
          <div className="text-xs uppercase tracking-wide opacity-60 mt-1">TSS</div>
        </div>
        <div className="bg-card text-card-foreground rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">
            {workout.intensityFactor.toFixed(2)}
          </div>
          <div className="text-xs uppercase tracking-wide opacity-60 mt-1">IF</div>
        </div>
      </div>

      {/* Segments List */}
      <div className={cn(
        "bg-card text-card-foreground rounded-xl overflow-hidden transition-all duration-300",
        showQuickEdit && "ring-2 ring-primary/40"
      )}>
        <div className={cn(
          "px-5 py-3 border-b border-border flex items-center justify-between",
          showQuickEdit && "bg-primary/10"
        )}>
          <h3 className="font-semibold text-sm">Segments</h3>
          {showQuickEdit && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
              Click to edit
            </span>
          )}
        </div>
        <div className="divide-y divide-border">
          {workout.segments.map((segment, index) => (
            <SegmentRow
              key={segment.id}
              segment={segment}
              index={index}
              ftp={ftp}
              isEditing={editingSegmentId === segment.id}
              showEditControls={showQuickEdit}
              onEdit={() => {
                setEditingSegmentId(segment.id);
                setHighlightedSegmentIndex(originalToExpandedMap[index]);
                // Scroll to the segment after a short delay
                setTimeout(() => {
                  const ref = segmentRefs.current.get(segment.id);
                  if (ref) {
                    ref.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }, 100);
              }}
              onCancelEdit={() => setEditingSegmentId(null)}
              onUpdate={(updates) => handleSegmentUpdate(index, updates)}
              onDelete={() => handleDeleteSegment(index)}
              onAddAfter={() => handleAddSegment(index)}
              canDelete={workout.segments.length > 1}
              rowRef={(el) => {
                if (el) {
                  segmentRefs.current.set(segment.id, el);
                } else {
                  segmentRefs.current.delete(segment.id);
                }
              }}
              onHover={(hovering) => {
                setHighlightedSegmentIndex(hovering ? originalToExpandedMap[index] : null);
              }}
            />
          ))}
        </div>
      </div>

      {/* FTP Notice */}
      <p className="text-sm text-center text-muted-foreground">
        Power values calculated using FTP of {ftp}W. Change in Settings.
      </p>
    </div>
  );
}

interface SegmentRowProps {
  segment: Segment;
  index: number;
  ftp: number;
  isEditing: boolean;
  showEditControls: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updates: Partial<Segment>) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  canDelete: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  onHover: (hovering: boolean) => void;
}

function SegmentRow({
  segment,
  index,
  ftp,
  isEditing,
  showEditControls,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onAddAfter,
  canDelete,
  rowRef,
  onHover,
}: SegmentRowProps) {
  const [editDuration, setEditDuration] = useState(formatDuration(segment.duration));
  const [editPower, setEditPower] = useState(segment.targetPower.value.toString());
  const [editPowerHigh, setEditPowerHigh] = useState(
    segment.targetPower.valueHigh?.toString() || ""
  );
  const [editType, setEditType] = useState(segment.type);

  const powerPercent = getPowerAsPercentFTP(segment, ftp);
  const powerWatts = getPowerAsWatts(segment, ftp);
  const zoneColor = getZoneColor(powerPercent);

  const handleSave = () => {
    const durationSeconds = parseDuration(editDuration);
    const power = parseInt(editPower) || segment.targetPower.value;
    const powerHigh = editPowerHigh ? parseInt(editPowerHigh) : undefined;

    onUpdate({
      type: editType,
      duration: durationSeconds,
      targetPower: {
        ...segment.targetPower,
        value: Math.max(30, Math.min(200, power)),
        valueHigh: powerHigh ? Math.max(30, Math.min(200, powerHigh)) : undefined,
      },
    });
  };

  if (isEditing) {
    return (
      <div
        ref={rowRef}
        className="p-4 bg-primary/10 border-l-4 border-primary animate-in fade-in-0 duration-200 relative"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <div className="absolute top-2 right-2">
          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
            Editing
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {/* Type */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type</label>
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as Segment["type"])}
              className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
            >
              <option value="warmup">Warm Up</option>
              <option value="steady">Steady</option>
              <option value="interval">Interval</option>
              <option value="recovery">Recovery</option>
              <option value="cooldown">Cool Down</option>
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Duration</label>
            <input
              type="text"
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
              placeholder="5:00"
              className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
            />
          </div>

          {/* Power */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Power %</label>
            <input
              type="number"
              value={editPower}
              onChange={(e) => setEditPower(e.target.value)}
              min={30}
              max={200}
              className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
            />
          </div>

          {/* Power High (for ramps) */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">End % (ramp)</label>
            <input
              type="number"
              value={editPowerHigh}
              onChange={(e) => setEditPowerHigh(e.target.value)}
              min={30}
              max={200}
              placeholder="Optional"
              className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onCancelEdit}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 font-medium shadow-md"
          >
            <Check className="w-3 h-3" />
            Save Changes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-center gap-4 p-4 transition-all duration-200",
        showEditControls
          ? "hover:bg-primary/10 hover:border-l-4 hover:border-l-primary/50 cursor-pointer hover:pl-3"
          : "hover:bg-muted/50"
      )}
      onClick={showEditControls ? onEdit : undefined}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Color indicator */}
      <div
        className="w-2 h-12 rounded-full flex-shrink-0"
        style={{ backgroundColor: zoneColor }}
      />

      {/* Segment info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {getSegmentTypeName(segment.type)}
          </span>
          {segment.repeat && segment.repeat > 1 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded">
              x{segment.repeat}
            </span>
          )}
        </div>
        {segment.instructions && (
          <p className="text-sm text-muted-foreground truncate">
            {segment.instructions}
          </p>
        )}
      </div>

      {/* Power */}
      <div className="text-right">
        <div className="font-medium">
          {segment.targetPower.valueHigh
            ? `${segment.targetPower.value}-${segment.targetPower.valueHigh}%`
            : `${Math.round(powerPercent)}%`}
        </div>
        <div className="text-sm text-muted-foreground">
          {segment.targetPower.valueHigh
            ? `${Math.round((segment.targetPower.value / 100) * ftp)}-${Math.round((segment.targetPower.valueHigh / 100) * ftp)}W`
            : `${powerWatts}W`}
        </div>
      </div>

      {/* Duration */}
      <div className="text-right min-w-[60px]">
        <div className="font-medium">
          {formatDuration(segment.duration)}
        </div>
      </div>

      {/* Edit controls */}
      {showEditControls && (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAddAfter}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="Add segment after"
          >
            <Plus className="w-4 h-4" />
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
              title="Delete segment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
