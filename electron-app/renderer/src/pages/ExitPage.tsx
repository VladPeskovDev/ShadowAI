import  { useEffect } from 'react';
import { quitApp } from '../ipcBridge';

const ExitPage = () => {
  useEffect(() => {
    quitApp();
  }, []);

  return <p>Выход...</p>;
};

export default ExitPage;
