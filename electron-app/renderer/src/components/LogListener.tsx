import { useEffect } from 'react';
import { useLogStore } from '../store/useLogStore';

const LogListener = () => {
  const addLog = useLogStore((state) => state.addLog);

  useEffect(() => {
    if (window.electronAPI?.onLogMessage) {
      window.electronAPI.onLogMessage((log) => {
        addLog(log as { type: 'info' | 'error'; message: string });
      });
    }
  }, []);

  return null;
};

export default LogListener;
