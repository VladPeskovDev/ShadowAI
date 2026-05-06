import  { useEffect } from 'react';
import { quitApp } from '../ipcBridge';
import { t } from '../i18n';

const ExitPage = () => {
  useEffect(() => {
    quitApp();
  }, []);

  return <p>{t('exit.title')}</p>;
};

export default ExitPage;
