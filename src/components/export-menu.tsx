"use client";

import { useState } from "react";
import { Workout } from "@/types/workout";
import { exportToZwo } from "@/lib/exporters/zwo-exporter";
import { Download, Share2, ChevronDown, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportMenuProps {
  workout: Workout;
  ftp: number;
}

export function ExportMenu({ workout, ftp }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExportZwo = () => {
    const zwoContent = exportToZwo(workout, ftp);
    const blob = new Blob([zwoContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workout.name.replace(/[^a-z0-9]/gi, "_")}.zwo`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const handleCopyLink = async () => {
    // Encode workout as base64 JSON for sharing
    const workoutData = JSON.stringify(workout);
    const encoded = btoa(workoutData);
    const url = `${window.location.origin}?workout=${encoded}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleExportJson = () => {
    const jsonContent = JSON.stringify(workout, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workout.name.replace(/[^a-z0-9]/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>Export</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            <button
              onClick={handleExportZwo}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Export .zwo</div>
                <div className="text-xs text-muted-foreground">Zwift workout file</div>
              </div>
            </button>

            <button
              onClick={handleExportJson}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left border-t border-border"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Export .json</div>
                <div className="text-xs text-muted-foreground">Custom format</div>
              </div>
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left border-t border-border"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium">{copied ? "Copied!" : "Copy Share Link"}</div>
                <div className="text-xs text-muted-foreground">Share via URL</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
