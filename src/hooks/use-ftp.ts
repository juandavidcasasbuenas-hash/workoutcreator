"use client";

import { useLocalStorage } from "./use-local-storage";

const DEFAULT_FTP = 200;

export function useFTP(): [number, (ftp: number) => void] {
  const [ftp, setFtp] = useLocalStorage<number | null>("user-ftp", null);
  // Return default FTP if not set (for components that need a number)
  return [ftp ?? DEFAULT_FTP, setFtp as (ftp: number) => void];
}

export function useRawFTP(): [number | null, (ftp: number | null) => void] {
  return useLocalStorage<number | null>("user-ftp", null);
}
