"use client";

import { X, ExternalLink, LogOut } from "lucide-react";
import { useStrava, PendingStravaUpload } from "@/hooks/use-strava";

interface StravaConnectModalProps {
  onClose: () => void;
  onConnectClick?: () => void;
  pendingUpload?: PendingStravaUpload;
}

export function StravaConnectModal({ onClose, onConnectClick, pendingUpload }: StravaConnectModalProps) {
  const { isConnected, isConfigured, athlete, connect, connectWithPendingUpload, disconnect } = useStrava();

  const handleConnect = () => {
    onConnectClick?.();
    if (pendingUpload) {
      connectWithPendingUpload(pendingUpload);
    } else {
      connect();
    }
  };

  const handleDisconnect = () => {
    disconnect();
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FC4C02] rounded-lg flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-white"
                fill="currentColor"
              >
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Strava</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!isConfigured ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm mb-4">
              Strava integration is not configured. Please add your Strava API credentials to the environment variables.
            </p>
            <a
              href="https://www.strava.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#FC4C02] hover:underline"
            >
              Get API Credentials
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : isConnected ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Connected
                </span>
              </div>
              {athlete && (
                <p className="text-sm text-muted-foreground mt-2">
                  Signed in as {athlete.firstname} {athlete.lastname}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Your workouts will be uploaded to Strava when you click &quot;Send to Strava&quot; after completing a workout.
            </p>

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect from Strava
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Strava account to automatically upload your completed workouts.
            </p>

            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-[#FC4C02]">•</span>
                Upload workouts after completion
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FC4C02]">•</span>
                Track your training history
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FC4C02]">•</span>
                Share with your community
              </li>
            </ul>

            <button
              onClick={handleConnect}
              className="w-full py-3 bg-[#FC4C02] text-white rounded-xl hover:bg-[#e04502] transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="currentColor"
              >
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Connect with Strava
            </button>

            <p className="text-xs text-muted-foreground text-center">
              You&apos;ll be redirected to Strava to authorize this app.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
