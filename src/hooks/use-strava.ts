"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

const STRAVA_STORAGE_KEY = "strava-auth";
const STRAVA_PENDING_UPLOAD_KEY = "strava-pending-upload";
const STRAVA_CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: StravaAthlete;
}

export interface StravaUploadResult {
  upload_id: number;
  status: string;
  activity_id: number | null;
  error: string | null;
}

export type StravaUploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

export interface PendingStravaUpload {
  tcxData: string;
  name: string;
  description: string;
  workoutId?: string; // To restore the workout view after OAuth
  workout?: string; // JSON stringified workout for restoration
}

export interface UseStravaReturn {
  isConnected: boolean;
  isConfigured: boolean;
  athlete: StravaAthlete | null;
  connect: () => void;
  connectWithPendingUpload: (pendingUpload: PendingStravaUpload) => void;
  disconnect: () => void;
  uploadActivity: (tcxData: string, name: string, description?: string) => Promise<StravaUploadResult>;
  uploadStatus: StravaUploadStatus;
  uploadError: string | null;
  activityUrl: string | null;
  handleAuthCallback: (authData: string) => void;
  hasPendingUpload: boolean;
  pendingUpload: PendingStravaUpload | null;
  clearPendingUpload: () => void;
}

function getStoredTokens(): StravaTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STRAVA_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error reading Strava tokens:", e);
  }
  return null;
}

function storeTokens(tokens: StravaTokens): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STRAVA_STORAGE_KEY, JSON.stringify(tokens));
  } catch (e) {
    console.error("Error storing Strava tokens:", e);
  }
}

function clearTokens(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STRAVA_STORAGE_KEY);
  } catch (e) {
    console.error("Error clearing Strava tokens:", e);
  }
}

function getPendingUpload(): PendingStravaUpload | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STRAVA_PENDING_UPLOAD_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error reading pending Strava upload:", e);
  }
  return null;
}

function storePendingUpload(data: PendingStravaUpload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STRAVA_PENDING_UPLOAD_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Error storing pending Strava upload:", e);
  }
}

function clearPendingUploadStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STRAVA_PENDING_UPLOAD_KEY);
  } catch (e) {
    console.error("Error clearing pending Strava upload:", e);
  }
}

async function refreshTokenIfNeeded(tokens: StravaTokens): Promise<StravaTokens | null> {
  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 300) {
    return tokens; // Token is still valid
  }

  try {
    const response = await fetch("/api/strava/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh token");
    }

    const newTokenData = await response.json();
    const updatedTokens: StravaTokens = {
      ...tokens,
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token,
      expires_at: newTokenData.expires_at,
    };

    storeTokens(updatedTokens);
    return updatedTokens;
  } catch (e) {
    console.error("Error refreshing Strava token:", e);
    return null;
  }
}

export function useStrava(): UseStravaReturn {
  const { user, supabase } = useAuth();
  const [tokens, setTokens] = useState<StravaTokens | null>(null);
  const [uploadStatus, setUploadStatus] = useState<StravaUploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activityUrl, setActivityUrl] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingStravaUpload | null>(null);

  // Hydrate from localStorage, then fall back to Supabase profile if logged in
  useEffect(() => {
    const stored = getStoredTokens();
    const pending = getPendingUpload();
    setPendingUpload(pending);

    if (stored) {
      setTokens(stored);
      setIsHydrated(true);
    } else if (user) {
      // No local tokens — try loading from Supabase profile
      supabase
        .from("profiles")
        .select("strava_tokens")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.strava_tokens) {
            const profileTokens = data.strava_tokens as StravaTokens;
            storeTokens(profileTokens); // cache locally
            setTokens(profileTokens);
          }
          setIsHydrated(true);
        });
    } else {
      setIsHydrated(true);
    }
  }, [user, supabase]);

  const isConfigured = Boolean(STRAVA_CLIENT_ID);
  const isConnected = isHydrated && tokens !== null;
  const hasPendingUpload = pendingUpload !== null;

  const clearPendingUpload = useCallback(() => {
    clearPendingUploadStorage();
    setPendingUpload(null);
  }, []);

  const doConnect = useCallback(() => {
    if (!STRAVA_CLIENT_ID) {
      console.error("Strava client ID not configured");
      return;
    }

    const redirectUri = `${window.location.origin}/api/strava/callback`;
    const scope = "activity:write,activity:read";

    const authUrl = new URL("https://www.strava.com/oauth/authorize");
    authUrl.searchParams.set("client_id", STRAVA_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("approval_prompt", "auto");

    window.location.href = authUrl.toString();
  }, []);

  const connect = useCallback(() => {
    doConnect();
  }, [doConnect]);

  const connectWithPendingUpload = useCallback((data: PendingStravaUpload) => {
    storePendingUpload(data);
    setPendingUpload(data);
    doConnect();
  }, [doConnect]);

  const disconnect = useCallback(() => {
    clearTokens();
    setTokens(null);
    setUploadStatus("idle");
    setUploadError(null);
    setActivityUrl(null);
    // Clear from Supabase profile if logged in
    if (user) {
      supabase
        .from("profiles")
        .update({ strava_tokens: null })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Error clearing Strava tokens from profile:", error);
        });
    }
  }, [user, supabase]);

  const handleAuthCallback = useCallback((authData: string) => {
    try {
      const parsed = JSON.parse(decodeURIComponent(authData));
      const newTokens: StravaTokens = {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_at: parsed.expires_at,
        athlete: parsed.athlete,
      };
      storeTokens(newTokens);
      setTokens(newTokens);
      // Persist to Supabase profile if logged in
      if (user) {
        supabase
          .from("profiles")
          .update({ strava_tokens: newTokens })
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) console.error("Error saving Strava tokens to profile:", error);
          });
      }
    } catch (e) {
      console.error("Error parsing Strava auth data:", e);
    }
  }, [user, supabase]);

  const uploadActivity = useCallback(
    async (tcxData: string, name: string, description?: string): Promise<StravaUploadResult> => {
      setUploadStatus("uploading");
      setUploadError(null);
      setActivityUrl(null);

      if (!tokens) {
        setUploadStatus("error");
        setUploadError("Not connected to Strava");
        throw new Error("Not connected to Strava");
      }

      try {
        // Refresh token if needed
        const validTokens = await refreshTokenIfNeeded(tokens);
        if (!validTokens) {
          setUploadStatus("error");
          setUploadError("Failed to refresh Strava token. Please reconnect.");
          clearTokens();
          setTokens(null);
          throw new Error("Token refresh failed");
        }

        if (validTokens !== tokens) {
          setTokens(validTokens);
          // Write refreshed tokens to Supabase
          if (user) {
            supabase
              .from("profiles")
              .update({ strava_tokens: validTokens })
              .eq("id", user.id)
              .then(({ error }) => {
                if (error) console.error("Error syncing refreshed Strava tokens:", error);
              });
          }
        }

        // Upload the activity
        const uploadResponse = await fetch("/api/strava/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: validTokens.access_token,
            tcx_data: tcxData,
            name,
            description: description || `Workout completed with BrowserTurbo`,
          }),
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          if (uploadResponse.status === 401) {
            clearTokens();
            setTokens(null);
            setUploadStatus("error");
            setUploadError("Strava session expired. Please reconnect.");
            throw new Error("Unauthorized");
          }
          throw new Error(errorData.error || "Upload failed");
        }

        const uploadData = await uploadResponse.json();

        if (uploadData.error) {
          setUploadStatus("error");
          setUploadError(uploadData.error);
          return uploadData;
        }

        // Poll for upload completion
        setUploadStatus("processing");
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const statusResponse = await fetch(
            `/api/strava/upload?upload_id=${uploadData.upload_id}`,
            {
              headers: {
                Authorization: `Bearer ${validTokens.access_token}`,
              },
            }
          );

          if (!statusResponse.ok) {
            throw new Error("Failed to check upload status");
          }

          const statusData = await statusResponse.json();

          if (statusData.status === "Your activity is ready.") {
            setUploadStatus("success");
            if (statusData.activity_id) {
              setActivityUrl(`https://www.strava.com/activities/${statusData.activity_id}`);
            }
            return statusData;
          }

          if (statusData.error) {
            setUploadStatus("error");
            setUploadError(statusData.error);
            return statusData;
          }

          attempts++;
        }

        // Timeout - but upload may still be processing
        setUploadStatus("success");
        return uploadData;
      } catch (e) {
        console.error("Strava upload error:", e);
        const msg = e instanceof TypeError
          ? "Network error — check your internet connection"
          : "Failed to upload to Strava";
        setUploadStatus("error");
        setUploadError(msg);
        throw e;
      }
    },
    [tokens, user, supabase]
  );

  return {
    isConnected,
    isConfigured,
    athlete: tokens?.athlete ?? null,
    connect,
    connectWithPendingUpload,
    disconnect,
    uploadActivity,
    uploadStatus,
    uploadError,
    activityUrl,
    handleAuthCallback,
    hasPendingUpload,
    pendingUpload,
    clearPendingUpload,
  };
}
