import { useEffect, useState, useRef } from 'react';

// 1. Define the shape of your incoming Electric Telemetry data
export interface ElectricMetrics {
  voltage: number;
  current: number;
  powerkW: number;
  timestamp: string;
  status: 'charging' | 'idle' | 'fault';
}

export const useElectricSocket = (url: string) => {
  const [data, setData] = useState<ElectricMetrics | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize connection
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to Electric Grid Stream');
    };

    // 2. THIS IS YOUR WEBSOCKET LISTENER
    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsedData: ElectricMetrics = JSON.parse(event.data);
        setData(parsedData); // Update React state with live metrics
      } catch (error) {
        console.error('Failed to parse grid telemetry:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from Electric Grid Stream');
    };

    // 3. Clean up the listener when the component unmounts
    return () => {
      ws.close();
    };
  }, [url]);

  // Function to send commands back to the system (e.g., turn off charger)
  const sendCommand = (command: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
    }
  };

  return { data, isConnected, sendCommand };
};
