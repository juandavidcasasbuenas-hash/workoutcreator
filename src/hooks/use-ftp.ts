"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { useLocalStorage } from "./use-local-storage";

const DEFAULT_FTP = 200;

export function useFTP(): [number, (ftp: number) => void] {
  const [ftp, setFtp] = useRawFTP();
  return [ftp ?? DEFAULT_FTP, setFtp as (ftp: number) => void];
}

export function useRawFTP(): [number | null, (ftp: number | null) => void] {
  const { user, supabase } = useAuth();
  const [localFtp, setLocalFtp] = useLocalStorage<number | null>("user-ftp", null);
  const [dbFtp, setDbFtp] = useState<number | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Fetch FTP from Supabase when logged in
  useEffect(() => {
    if (!user) {
      setDbFtp(null);
      setDbLoaded(false);
      return;
    }

    supabase
      .from("profiles")
      .select("ftp")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setDbFtp(data.ftp);
        }
        setDbLoaded(true);
      });
  }, [user, supabase]);

  const setFtp = useCallback(
    (value: number | null) => {
      if (!user) {
        setLocalFtp(value);
        return;
      }

      setDbFtp(value);
      // Also update localStorage as cache
      setLocalFtp(value);
      supabase
        .from("profiles")
        .update({ ftp: value })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("Error saving FTP:", error);
        });
    },
    [user, supabase, setLocalFtp]
  );

  // When logged in and DB loaded, use DB value (fallback to localStorage)
  const ftp = user && dbLoaded ? (dbFtp ?? localFtp) : localFtp;

  return [ftp, setFtp];
}
