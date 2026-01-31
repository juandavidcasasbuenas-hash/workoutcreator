"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  TrainerConnectionState,
  TrainerMetrics,
  TrainerCapabilities,
  BLUETOOTH_UUIDS,
  FTMS_OPCODES,
  WAHOO_OPCODES,
} from "@/types/trainer";

interface UseTrainerReturn {
  connectionState: TrainerConnectionState;
  trainerName: string | null;
  metrics: TrainerMetrics;
  capabilities: TrainerCapabilities;
  errorMessage: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setTargetPower: (watts: number) => Promise<boolean>;
  setResistanceMode: (level: number) => Promise<boolean>;
  isSupported: boolean;
}

export function useTrainer(): UseTrainerReturn {
  const [connectionState, setConnectionState] = useState<TrainerConnectionState>('disconnected');
  const [trainerName, setTrainerName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TrainerMetrics>({
    power: null,
    cadence: null,
    speed: null,
    heartRate: null,
    timestamp: Date.now(),
  });
  const [capabilities, setCapabilities] = useState<TrainerCapabilities>({
    hasFTMS: false,
    hasWahooExtension: false,
    hasCyclingPower: false,
    controlProtocol: 'none',
  });

  // Refs for Bluetooth objects
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const ftmsControlPointRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const wahooTrainerRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  // Refs for cadence calculation
  const lastCrankRevsRef = useRef<number | null>(null);
  const lastCrankTimeRef = useRef<number | null>(null);

  // Check if Web Bluetooth is supported
  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Cleanup function
  const cleanup = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
    serverRef.current = null;
    ftmsControlPointRef.current = null;
    wahooTrainerRef.current = null;
    lastCrankRevsRef.current = null;
    lastCrankTimeRef.current = null;
  }, []);

  // Handle device disconnection
  useEffect(() => {
    const handleDisconnect = () => {
      setConnectionState('disconnected');
      setTrainerName(null);
      setMetrics({
        power: null,
        cadence: null,
        speed: null,
        heartRate: null,
        timestamp: Date.now(),
      });
      cleanup();
    };

    const device = deviceRef.current;
    if (device) {
      device.addEventListener('gattserverdisconnected', handleDisconnect);
      return () => {
        device.removeEventListener('gattserverdisconnected', handleDisconnect);
      };
    }
  }, [cleanup, connectionState]);

  // Parse FTMS Indoor Bike Data
  const parseFTMSIndoorBikeData = useCallback((data: DataView) => {
    const flags = data.getUint16(0, true);
    let offset = 2;

    const metrics: Partial<TrainerMetrics> = {
      timestamp: Date.now(),
    };

    // Instantaneous Speed (if present)
    if (!(flags & 0x01)) {
      // Speed is present when bit 0 is 0
      const speed = data.getUint16(offset, true) / 100; // km/h with 0.01 resolution
      metrics.speed = speed;
      offset += 2;
    }

    // Average Speed (skip if present)
    if (flags & 0x02) {
      offset += 2;
    }

    // Instantaneous Cadence (if present)
    if (flags & 0x04) {
      const cadence = data.getUint16(offset, true) / 2; // 0.5 RPM resolution
      metrics.cadence = Math.round(cadence);
      offset += 2;
    }

    // Average Cadence (skip if present)
    if (flags & 0x08) {
      offset += 2;
    }

    // Total Distance (skip if present)
    if (flags & 0x10) {
      offset += 3;
    }

    // Resistance Level (skip if present)
    if (flags & 0x20) {
      offset += 2;
    }

    // Instantaneous Power (if present)
    if (flags & 0x40) {
      const power = data.getInt16(offset, true);
      metrics.power = power;
      offset += 2;
    }

    // Average Power (skip if present)
    if (flags & 0x80) {
      offset += 2;
    }

    // Heart Rate (if present)
    if (flags & 0x200) {
      metrics.heartRate = data.getUint8(offset);
    }

    setMetrics((prev) => ({
      ...prev,
      ...metrics,
    }));
  }, []);

  // Parse Cycling Power Measurement
  const parseCyclingPowerMeasurement = useCallback((data: DataView) => {
    const flags = data.getUint16(0, true);
    let offset = 2;

    // Instantaneous Power (always present)
    const power = data.getInt16(offset, true);
    offset += 2;

    const metrics: Partial<TrainerMetrics> = {
      power,
      timestamp: Date.now(),
    };

    // Skip balance data if present
    if (flags & 0x01) offset += 1;

    // Skip torque data if present
    if (flags & 0x04) offset += 2;

    // Wheel revolution data (skip if present)
    if (flags & 0x10) offset += 6;

    // Crank revolution data (for cadence calculation)
    if (flags & 0x20) {
      const crankRevs = data.getUint16(offset, true);
      const crankTime = data.getUint16(offset + 2, true);

      if (lastCrankRevsRef.current !== null && lastCrankTimeRef.current !== null) {
        // Handle rollover (16-bit values)
        const dRevs = (crankRevs - lastCrankRevsRef.current + 65536) % 65536;
        const dTime = (crankTime - lastCrankTimeRef.current + 65536) % 65536;

        if (dTime > 0 && dRevs < 100) { // Sanity check
          const dTimeSec = dTime / 1024; // 1/1024 second resolution
          const rpm = (dRevs / dTimeSec) * 60;
          if (rpm < 200) { // Reasonable cadence limit
            metrics.cadence = Math.round(rpm);
          }
        } else if (dTime > 2048) { // ~2 seconds with no update = stopped
          metrics.cadence = 0;
        }
      }

      lastCrankRevsRef.current = crankRevs;
      lastCrankTimeRef.current = crankTime;
    }

    setMetrics((prev) => ({
      ...prev,
      ...metrics,
    }));
  }, []);

  // Parse Heart Rate Measurement
  const parseHeartRateMeasurement = useCallback((data: DataView) => {
    const flags = data.getUint8(0);
    const is16Bit = flags & 0x01;
    const heartRate = is16Bit ? data.getUint16(1, true) : data.getUint8(1);

    setMetrics((prev) => ({
      ...prev,
      heartRate,
      timestamp: Date.now(),
    }));
  }, []);

  // Connect to trainer
  const connect = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage('Web Bluetooth is not supported in this browser');
      setConnectionState('error');
      return;
    }

    try {
      setConnectionState('connecting');
      setErrorMessage(null);

      // Request device with required services
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [BLUETOOTH_UUIDS.FTMS_SERVICE] },
          { services: [BLUETOOTH_UUIDS.CYCLING_POWER_SERVICE] },
        ],
        optionalServices: [
          BLUETOOTH_UUIDS.FTMS_SERVICE,
          BLUETOOTH_UUIDS.CYCLING_POWER_SERVICE,
          BLUETOOTH_UUIDS.HEART_RATE_SERVICE,
          BLUETOOTH_UUIDS.WAHOO_EXTENSION_SERVICE,
        ],
      });

      deviceRef.current = device;
      setTrainerName(device.name || 'Unknown Trainer');

      // Connect to GATT server
      if (!device.gatt) {
        throw new Error('Device does not support GATT');
      }
      const server = await device.gatt.connect();
      serverRef.current = server;

      const caps: TrainerCapabilities = {
        hasFTMS: false,
        hasWahooExtension: false,
        hasCyclingPower: false,
        controlProtocol: 'none',
      };

      // Try to get FTMS service
      try {
        const ftmsService = await server.getPrimaryService(BLUETOOTH_UUIDS.FTMS_SERVICE);
        caps.hasFTMS = true;

        // Subscribe to Indoor Bike Data
        try {
          const indoorBikeData = await ftmsService.getCharacteristic(BLUETOOTH_UUIDS.FTMS_INDOOR_BIKE_DATA);
          await indoorBikeData.startNotifications();
          indoorBikeData.addEventListener('characteristicvaluechanged', (event) => {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            if (target.value) {
              parseFTMSIndoorBikeData(target.value);
            }
          });
        } catch {
          console.log('Indoor Bike Data not available');
        }

        // Get FTMS Control Point
        try {
          const controlPoint = await ftmsService.getCharacteristic(BLUETOOTH_UUIDS.FTMS_CONTROL_POINT);
          ftmsControlPointRef.current = controlPoint;
          caps.controlProtocol = 'ftms';

          // Subscribe to control point responses
          await controlPoint.startNotifications();
        } catch {
          console.log('FTMS Control Point not available');
        }
      } catch {
        console.log('FTMS service not available');
      }

      // Try to get Cycling Power service
      try {
        const powerService = await server.getPrimaryService(BLUETOOTH_UUIDS.CYCLING_POWER_SERVICE);
        caps.hasCyclingPower = true;

        // Subscribe to Power Measurement
        const powerMeasurement = await powerService.getCharacteristic(BLUETOOTH_UUIDS.CYCLING_POWER_MEASUREMENT);
        await powerMeasurement.startNotifications();
        powerMeasurement.addEventListener('characteristicvaluechanged', (event) => {
          const target = event.target as BluetoothRemoteGATTCharacteristic;
          if (target.value) {
            parseCyclingPowerMeasurement(target.value);
          }
        });

        // Try to get Wahoo extension characteristic from Cycling Power service
        // (Kickr bikes expose the Wahoo control characteristic here)
        try {
          const wahooTrainer = await powerService.getCharacteristic(BLUETOOTH_UUIDS.WAHOO_TRAINER);
          wahooTrainerRef.current = wahooTrainer;
          caps.hasWahooExtension = true;
          // Enable notifications if supported
          try { await wahooTrainer.startNotifications(); } catch { /* optional */ }
          console.log('Wahoo extension found in Cycling Power service');

          // If no FTMS control, use Wahoo
          if (caps.controlProtocol === 'none') {
            caps.controlProtocol = 'wahoo';
          }
        } catch {
          console.log('Wahoo extension not in Cycling Power service');
        }
      } catch {
        console.log('Cycling Power service not available');
      }

      // Try to get Wahoo Extension as separate service (some trainers expose it this way)
      if (!caps.hasWahooExtension) {
        try {
          const wahooService = await server.getPrimaryService(BLUETOOTH_UUIDS.WAHOO_EXTENSION_SERVICE);
          const wahooTrainer = await wahooService.getCharacteristic(BLUETOOTH_UUIDS.WAHOO_TRAINER);
          wahooTrainerRef.current = wahooTrainer;
          caps.hasWahooExtension = true;

          // If no FTMS control, use Wahoo
          if (caps.controlProtocol === 'none') {
            caps.controlProtocol = 'wahoo';
          }
        } catch {
          console.log('Wahoo Extension service not available');
        }
      }

      // Try to get Heart Rate service
      try {
        const hrService = await server.getPrimaryService(BLUETOOTH_UUIDS.HEART_RATE_SERVICE);
        const hrMeasurement = await hrService.getCharacteristic(BLUETOOTH_UUIDS.HEART_RATE_MEASUREMENT);
        await hrMeasurement.startNotifications();
        hrMeasurement.addEventListener('characteristicvaluechanged', (event) => {
          const target = event.target as BluetoothRemoteGATTCharacteristic;
          if (target.value) {
            parseHeartRateMeasurement(target.value);
          }
        });
      } catch {
        console.log('Heart Rate service not available');
      }

      setCapabilities(caps);

      // Request FTMS control if available
      if (ftmsControlPointRef.current) {
        try {
          // Request Control (opcode 0x00)
          const requestControl = new Uint8Array([FTMS_OPCODES.REQUEST_CONTROL]);
          await ftmsControlPointRef.current.writeValueWithResponse(requestControl);

          // Small delay then Start/Resume (opcode 0x07)
          await new Promise((resolve) => setTimeout(resolve, 100));
          const startResume = new Uint8Array([FTMS_OPCODES.START_RESUME]);
          await ftmsControlPointRef.current.writeValueWithResponse(startResume);
        } catch (err) {
          console.log('Failed to request FTMS control:', err);
        }
      }

      setConnectionState('connected');
    } catch (err) {
      console.error('Connection error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect to trainer');
      setConnectionState('error');
      cleanup();
    }
  }, [isSupported, cleanup, parseFTMSIndoorBikeData, parseCyclingPowerMeasurement, parseHeartRateMeasurement]);

  // Disconnect from trainer
  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState('disconnected');
    setTrainerName(null);
    setMetrics({
      power: null,
      cadence: null,
      speed: null,
      heartRate: null,
      timestamp: Date.now(),
    });
  }, [cleanup]);

  // Set target power (ERG mode)
  const setTargetPower = useCallback(async (watts: number): Promise<boolean> => {
    if (connectionState !== 'connected') {
      return false;
    }

    const clampedWatts = Math.max(0, Math.min(2000, Math.round(watts)));

    // Try FTMS first
    if (ftmsControlPointRef.current && capabilities.controlProtocol === 'ftms') {
      try {
        const command = new Uint8Array(3);
        command[0] = FTMS_OPCODES.SET_TARGET_POWER;
        command[1] = clampedWatts & 0xff;
        command[2] = (clampedWatts >> 8) & 0xff;
        await ftmsControlPointRef.current.writeValueWithResponse(command);
        return true;
      } catch (err) {
        console.error('FTMS set power failed:', err);
      }
    }

    // Fallback to Wahoo
    if (wahooTrainerRef.current && capabilities.hasWahooExtension) {
      try {
        const command = new Uint8Array(3);
        command[0] = WAHOO_OPCODES.SET_ERG_MODE;
        command[1] = clampedWatts & 0xff;
        command[2] = (clampedWatts >> 8) & 0xff;
        await wahooTrainerRef.current.writeValueWithResponse(command);
        return true;
      } catch (err) {
        console.error('Wahoo set power failed:', err);
      }
    }

    return false;
  }, [connectionState, capabilities]);

  // Set resistance mode (manual/free ride mode)
  // Level is 0-100 representing percentage of max resistance
  const setResistanceMode = useCallback(async (level: number): Promise<boolean> => {
    if (connectionState !== 'connected') {
      return false;
    }

    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));

    // Try FTMS first - use SET_TARGET_RESISTANCE
    if (ftmsControlPointRef.current && capabilities.controlProtocol === 'ftms') {
      try {
        const command = new Uint8Array(2);
        command[0] = FTMS_OPCODES.SET_TARGET_RESISTANCE;
        // FTMS resistance is in 0.1 increments, so level 50 = 5.0 resistance
        command[1] = clampedLevel;
        await ftmsControlPointRef.current.writeValueWithResponse(command);
        return true;
      } catch (err) {
        console.error('FTMS set resistance failed:', err);
      }
    }

    // Fallback to Wahoo - use SET_RESISTANCE_MODE
    if (wahooTrainerRef.current && capabilities.hasWahooExtension) {
      try {
        const command = new Uint8Array(2);
        command[0] = WAHOO_OPCODES.SET_RESISTANCE_MODE;
        // Wahoo resistance level is 0-100
        command[1] = clampedLevel;
        await wahooTrainerRef.current.writeValueWithResponse(command);
        return true;
      } catch (err) {
        console.error('Wahoo set resistance failed:', err);
      }
    }

    return false;
  }, [connectionState, capabilities]);

  return {
    connectionState,
    trainerName,
    metrics,
    capabilities,
    errorMessage,
    connect,
    disconnect,
    setTargetPower,
    setResistanceMode,
    isSupported,
  };
}
