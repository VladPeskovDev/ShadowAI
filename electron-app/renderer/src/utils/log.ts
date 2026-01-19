import { useLogStore } from '../store/useLogStore';

export function addErrorLog(message: string) {
  useLogStore.getState().addLog({ type: 'error', message });
}

export function addInfoLog(message: string) {
  useLogStore.getState().addLog({ type: 'info', message });
}
