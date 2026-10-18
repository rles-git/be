
"use client";

import { useEffect, useRef, useState } from "react";

export interface ElectricMetrics {
  stationId: string;
  voltage: number;
"use client";

import { useEffect, useRef, useState } from "react";

export interface ElectricMetrics {
  stationId: string;
  voltage: number;
  current: number;
  powerkW: number;
  timestamp: string;
  status: "charging" | "idle" | "fault";
}

export const useElectricSocket = (url: string) => {
  const [data, setData] = useState<Record<string, ElectricMetrics>>({});
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) {
      console.error("WebSocket URL is not configured");
      return;
    }

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Ignore command acknowledgements; this state stores telemetry only.
        if (
          !message.stationId ||
          !["charging", "idle", "fault"].includes(message.status)
        ) {
          return;
        }

        const metric = message as ElectricMetrics;

        setData((previous) => ({
          ...previous,
          [metric.stationId]: metric,
        }));
      } catch (error) {
        console.error("Invalid WebSocket message:", error);
      }
    };

    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [url]);

  const sendCommand = (command: object): boolean => {
    const ws = socketRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify(command));
    return true;
  };

  return { data, isConnected, sendCommand };
};

  current: number;
  powerkW: number;
  timestamp: string;
  status: "charging" | "idle" | "fault";
}

export const useElectricSocket = (url: string) => {
  const [data, setData] = useState<Record<string, ElectricMetrics>>({});
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_CHARGER_WS_URL;

    if (!url) {
      console.error("WebSocket URL is not configured");
      return;
    }
    
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const metric = JSON.parse(event.data) as ElectricMetrics;

        if (
          !metric.stationId ||
          !["charging", "idle", "fault"].includes(metric.status)
        ) {
          return;
        }

        setData((previous) => ({
          ...previous,
          [metric.stationId]: metric,
        }));
      } catch (error) {
        console.error("Invalid telemetry message:", error);
      }
    };

    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [url]);

  const sendCommand = (command: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
    }
  };

  return { data, isConnected, sendCommand };
};
