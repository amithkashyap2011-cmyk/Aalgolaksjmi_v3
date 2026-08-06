import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useDashboardStore } from '../store/useDashboardStore';

const SOCKET_URL = import.meta.env.VITE_API_URL || '';

export const useSocket = () => {
  const { addLog, addTrade, setStatus, setWeatherIntelligence } = useDashboardStore();

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('WEATHER_INTELLIGENCE', (data) => {
      setWeatherIntelligence(data);
    });

    socket.on('AQEA_DECISION_STREAM', (decision) => {
      addLog({
        type: 'DECISION',
        ...decision
      });
    });

    socket.on('AQEA_MANAGEMENT_EVENT', (event) => {
      addLog({
        type: 'MANAGEMENT',
        ...event
      });
    });

    socket.on('SYSTEM_TELEMETRY', (telemetry) => {
      // Update status or specific system stats
    });

    socket.on('TRADE_UPDATE', (trade) => {
      addTrade(trade);
    });

    return () => {
      socket.disconnect();
    };
  }, [addLog, addTrade, setStatus]);
};
