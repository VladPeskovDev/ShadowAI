import { useEffect } from 'react';
import { useLogStore } from '../store/useLogStore';
import { onLogMessage } from '../ipcBridge';  

const LogListener = () => {
  const addLog = useLogStore((state) => state.addLog);

  useEffect(() => {
    onLogMessage((log) => {
      addLog(log as { type: 'info' | 'error' | 'warning'; message: string });
    });
  }, [addLog]);

  return null;
};

export default LogListener;