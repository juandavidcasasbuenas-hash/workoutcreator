"use client";

import { useState, useEffect } from "react";
import { X, Download, Upload, Image, BarChart3, Type, Ban } from "lucide-react";
import { CompletedWorkoutSummary } from "@/types/workout";
import { generateWorkoutImage, downloadImage, WorkoutImageType } from "@/lib/workout-image";
import { cn } from "@/lib/utils";

interface StravaImageModalProps {
  onClose: () => void;
  onUpload: () => void;
  workoutName: string;
  summary: CompletedWorkoutSummary;
  ftp: number;
  isUploading?: boolean;
}

const IMAGE_OPTIONS: { type: WorkoutImageType; label: string; icon: typeof Image; description: string }[] = [
  { type: "summary", label: "Summary", icon: BarChart3, description: "Duration, power, NP, TSS" },
  { type: "peaks", label: "Peak Power", icon: BarChart3, description: "Best efforts by duration" },
  { type: "logo", label: "App Logo", icon: Type, description: "BrowserTurbo branding" },
  { type: "none", label: "No Image", icon: Ban, description: "Upload without image" },
];

export function StravaImageModal({
  onClose,
  onUpload,
  workoutName,
  summary,
  ftp,
  isUploading = false,
}: StravaImageModalProps) {
  const [selectedType, setSelectedType] = useState<WorkoutImageType>("summary");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate preview when selection changes
  useEffect(() => {
    let cancelled = false;

    async function generate() {
      if (selectedType === "none") {
        setPreviewUrl(null);
        return;
      }

      setIsGenerating(true);
      try {
        const url = await generateWorkoutImage({
          type: selectedType,
          workoutName,
          summary,
          ftp,
        });
        if (!cancelled) {
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error("Failed to generate image:", err);
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }

    generate();

    return () => {
      cancelled = true;
    };
  }, [selectedType, workoutName, summary, ftp]);

  const handleDownload = () => {
    if (previewUrl) {
      const filename = `${workoutName.replace(/[^a-z0-9]/gi, "_")}_${selectedType}.png`;
      downloadImage(previewUrl, filename);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">Share to Strava</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Image type selection */}
          <div className="mb-4">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Choose an image to share
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {IMAGE_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    selectedType === option.type
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <option.icon className={cn(
                    "w-5 h-5 mb-1",
                    selectedType === option.type ? "text-primary" : "text-muted-foreground"
                  )} />
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {selectedType !== "none" && (
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Preview
              </label>
              <div className="bg-muted rounded-lg overflow-hidden aspect-square max-w-sm mx-auto">
                {isGenerating ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Image className="w-12 h-12" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            {selectedType !== "none"
              ? "Download the image and add it to your Strava activity via the Strava app."
              : "Your workout will be uploaded without an accompanying image."}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row gap-3">
          {selectedType !== "none" && previewUrl && (
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border hover:bg-accent transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download Image
            </button>
          )}
          <button
            onClick={onUpload}
            disabled={isUploading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#FC4C02] text-white hover:bg-[#e04502] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload to Strava
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
