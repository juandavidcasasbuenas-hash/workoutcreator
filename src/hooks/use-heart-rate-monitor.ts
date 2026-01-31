"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { BLUETOOTH_UUIDS } from "@/types/trainer";

export type HRMonitorConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface UseHeartRateMonitorReturn {
  connectionState: HRMonitorConnectionState;
  deviceName: string | null;
  heartRate: number | null;
  errorMessage: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isSupported: boolean;
}

export function useHeartRateMonitor(): UseHeartRateMonitorReturn {
  const [connectionState, setConnectionState] = useState<HRMonitorConnectionState>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);

  const isSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  const cleanup = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
  }, []);

  // Handle device disconnection
  useEffect(() => {
    const handleDisconnect = () => {
      setConnectionState("disconnected");
      setDeviceName(null);
      setHeartRate(null);
      cleanup();
    };

    const device = deviceRef.current;
    if (device) {
      device.addEventListener("gattserverdisconnected", handleDisconnect);
      return () => {
        device.removeEventListener("gattserverdisconnected", handleDisconnect);
      };
    }
  }, [cleanup, connectionState]);

  // Parse Heart Rate Measurement
  const parseHeartRateMeasurement = useCallback((data: DataView) => {
    const flags = data.getUint8(0);
    const is16Bit = flags & 0x01;
    const hr = is16Bit ? data.getUint16(1, true) : data.getUint8(1);
    setHeartRate(hr);
  }, []);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage("Web Bluetooth is not supported in this browser");
      setConnectionState("error");
      return;
    }

    try {
      setConnectionState("connecting");
      setErrorMessage(null);

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLUETOOTH_UUIDS.HEART_RATE_SERVICE] }],
        optionalServices: [BLUETOOTH_UUIDS.HEART_RATE_SERVICE],
      });

      deviceRef.current = device;
      setDeviceName(device.name || "HR Monitor");

      if (!device.gatt) {
        throw new Error("Device does not support GATT");
      }
      const server = await device.gatt.connect();

      const hrService = await server.getPrimaryService(BLUETOOTH_UUIDS.HEART_RATE_SERVICE);
      const hrMeasurement = await hrService.getCharacteristic(BLUETOOTH_UUIDS.HEART_RATE_MEASUREMENT);

      await hrMeasurement.startNotifications();
      hrMeasurement.addEventListener("characteristicvaluechanged", (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        if (target.value) {
          parseHeartRateMeasurement(target.value);
        }
      });

      setConnectionState("connected");
    } catch (err) {
      console.error("HR Monitor connection error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to connect to HR monitor");
      setConnectionState("error");
      cleanup();
    }
  }, [isSupported, cleanup, parseHeartRateMeasurement]);

  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState("disconnected");
    setDeviceName(null);
    setHeartRate(null);
  }, [cleanup]);

  return {
    connectionState,
    deviceName,
    heartRate,
    errorMessage,
    connect,
    disconnect,
    isSupported,
  };
}
