// Trainer connection states
export type TrainerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Control mode for trainer resistance
export type ControlMode = 'erg' | 'manual';

// Real-time metrics from trainer
export interface TrainerMetrics {
  power: number | null;        // Current power in watts
  cadence: number | null;      // Current cadence in RPM
  speed: number | null;        // Current speed in km/h (optional)
  heartRate: number | null;    // Heart rate in BPM (optional)
  timestamp: number;           // When the metrics were received
}

// Trainer capabilities detected during connection
export interface TrainerCapabilities {
  hasFTMS: boolean;            // Fitness Machine Service support
  hasWahooExtension: boolean;  // Wahoo-specific control extension
  hasCyclingPower: boolean;    // Cycling Power Service support
  controlProtocol: 'ftms' | 'wahoo' | 'none';
}

// Player status for workout execution
export type PlayerStatus = 'stopped' | 'playing' | 'paused' | 'completed';

// Workout player state
export interface PlayerState {
  status: PlayerStatus;
  elapsedTime: number;          // Total elapsed time in seconds
  currentSegmentIndex: number;  // Index of current segment in expanded segments
  segmentElapsedTime: number;   // Time elapsed in current segment
  controlMode: ControlMode;
  targetPower: number;          // Current target power in watts
}

// Recorded data point for post-workout analysis
export interface RecordedDataPoint {
  timestamp: number;
  elapsedTime: number;
  targetPower: number;
  actualPower: number | null;
  cadence: number | null;
  heartRate: number | null;
  segmentIndex: number;
}

// Bluetooth UUIDs for trainer services and characteristics
export const BLUETOOTH_UUIDS = {
  // Services
  FTMS_SERVICE: '00001826-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_SERVICE: '00001818-0000-1000-8000-00805f9b34fb',
  HEART_RATE_SERVICE: '0000180d-0000-1000-8000-00805f9b34fb',
  WAHOO_EXTENSION_SERVICE: 'a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b',

  // FTMS Characteristics
  FTMS_FEATURE: '00002acc-0000-1000-8000-00805f9b34fb',
  FTMS_INDOOR_BIKE_DATA: '00002ad2-0000-1000-8000-00805f9b34fb',
  FTMS_CONTROL_POINT: '00002ad9-0000-1000-8000-00805f9b34fb',
  FTMS_STATUS: '00002ada-0000-1000-8000-00805f9b34fb',

  // Cycling Power Characteristics
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_FEATURE: '00002a65-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_CONTROL_POINT: '00002a66-0000-1000-8000-00805f9b34fb',

  // Heart Rate Characteristics
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',

  // Wahoo Extension Characteristics
  WAHOO_TRAINER: 'a026e005-0a7d-4ab3-97fa-f1500f9feb8b',
} as const;

// FTMS Control Point Opcodes
export const FTMS_OPCODES = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_SPEED: 0x02,
  SET_TARGET_INCLINE: 0x03,
  SET_TARGET_RESISTANCE: 0x04,
  SET_TARGET_POWER: 0x05,
  SET_TARGET_HEART_RATE: 0x06,
  START_RESUME: 0x07,
  STOP_PAUSE: 0x08,
  RESPONSE_CODE: 0x80,
} as const;

// Wahoo ERG Control Opcodes
export const WAHOO_OPCODES = {
  SET_ERG_MODE: 0x42,
  SET_RESISTANCE_MODE: 0x40,
  SET_SIM_MODE: 0x43,
} as const;
