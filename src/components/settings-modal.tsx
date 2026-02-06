"use client";

import { useState } from "react";
import { useFTP } from "@/hooks/use-ftp";
import { useAuth } from "@/components/auth-provider";
import { X } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [ftp, setFtp] = useFTP();
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState(ftp.toString());
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = () => {
    const value = parseInt(inputValue);
    if (isNaN(value) || value < 50 || value > 500) {
      setError("Please enter a valid FTP between 50 and 500 watts");
      return;
    }
    setFtp(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* FTP Setting */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              FTP (watts)
            </label>
            <input
              type="number"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              min={50}
              max={500}
              className="w-full px-4 py-3 bg-background rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-lg tabular-nums"
            />
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity font-medium"
          >
            Save
          </button>
        </div>

        {/* Delete Account */}
        {user && !showDeleteConfirm && (
          <div className="mt-6 pt-4 border-t border-border text-center">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-destructive hover:opacity-70 transition-opacity"
            >
              Delete account
            </button>
          </div>
        )}

        {/* Delete Confirmation — replaces entire modal content */}
        {user && showDeleteConfirm && (
          <div className="absolute inset-0 bg-card rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <span className="text-destructive text-lg">!</span>
            </div>
            <h3 className="text-base font-semibold mb-2">Delete account?</h3>
            <p className="text-xs text-muted-foreground mb-6 max-w-[240px]">
              This will permanently delete your account and all your workouts. This cannot be undone.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  const res = await fetch("/api/account/delete", { method: "POST" });
                  if (res.ok) {
                    window.location.href = "/";
                  } else {
                    setError("Failed to delete account. Please try again.");
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 text-sm bg-destructive text-destructive-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
