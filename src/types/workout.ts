import { RecordedDataPoint } from "./trainer";

export type SegmentType = "warmup" | "interval" | "recovery" | "cooldown" | "steady";

export type PowerTargetType = "percent_ftp" | "absolute_watts" | "zone";

// Peak power for a specific duration
export interface PeakPower {
  duration: number; // seconds
  power: number;    // watts
}

// Completion data types
export interface CompletedWorkoutSummary {
  actualDuration: number;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  normalizedPower: number | null;
  actualTSS: number | null;
  peakPowers: PeakPower[];
}

export interface WorkoutCompletion {
  completedAt: string;
  startedAt: string;
  summary: CompletedWorkoutSummary;
  recordedData: RecordedDataPoint[];
  stravaActivityId?: number;
  stravaActivityUrl?: string;
}

export interface PowerTarget {
  type: PowerTargetType;
  value: number;
  valueHigh?: number; // For ranges (e.g., 88-94% FTP)
}

export interface CadenceTarget {
  min: number;
  max: number;
}

export interface Segment {
  id: string;
  type: SegmentType;
  duration: number; // seconds
  targetPower: PowerTarget;
  cadenceTarget?: CadenceTarget;
  instructions?: string;
  repeat?: number; // For interval blocks
}

export interface Workout {
  id: string;
  name: string;
  description: string;
  totalDuration: number; // seconds
  estimatedTSS: number;
  intensityFactor: number;
  segments: Segment[];
  createdAt: string;
  source: "ai" | "file" | "image";
  completion?: WorkoutCompletion;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateWorkoutRequest {
  prompt: string;
  ftp?: number;
  conversationHistory?: ConversationMessage[];
}

export interface GenerateWorkoutResponse {
  workout?: Workout;
  followUpQuestion?: {
    question: string;
    options?: string[];
  };
  error?: string;
}

export interface ParseImageResponse {
  workout: Workout;
  confidence: number;
  rawDescription: string;
}

// Zone definitions based on percent of FTP
// Refined, tasteful palette - muted but vivid
export const POWER_ZONES = {
  1: { name: "Active Recovery", min: 0, max: 55, color: "#6b7a8a" },   // slate blue-gray
  2: { name: "Endurance", min: 55, max: 75, color: "#2a9d8f" },        // teal
  3: { name: "Tempo", min: 75, max: 90, color: "#4ade80" },            // green
  4: { name: "Threshold", min: 90, max: 105, color: "#e9a23b" },       // amber/orange
  5: { name: "VO2max", min: 105, max: 120, color: "#c44da8" },         // magenta
  6: { name: "Anaerobic", min: 120, max: 150, color: "#9061f9" },      // violet/purple
  7: { name: "Neuromuscular", min: 150, max: 200, color: "#6d28d9" },  // deeper purple
} as const;

export type ZoneNumber = keyof typeof POWER_ZONES;

export function getZoneForPower(percentFTP: number): ZoneNumber {
  if (percentFTP < 55) return 1;
  if (percentFTP < 75) return 2;
  if (percentFTP < 90) return 3;
  if (percentFTP < 105) return 4;
  if (percentFTP < 120) return 5;
  if (percentFTP < 150) return 6;
  return 7;
}

export function getZoneColor(percentFTP: number): string {
  const zone = getZoneForPower(percentFTP);
  return POWER_ZONES[zone].color;
}

export function generateId(): string {
  // Use crypto.randomUUID when available (browser and Node 19+), fallback to timestamp + random
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random for uniqueness
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}
