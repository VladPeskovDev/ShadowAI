import { create } from 'zustand';

type LogType = 'info' | 'error';

type Log = {
  type: LogType;
  message: string;
};

type LogStore = {
  logs: Log[];
  addLog: (log: Log) => void;
};

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
}));