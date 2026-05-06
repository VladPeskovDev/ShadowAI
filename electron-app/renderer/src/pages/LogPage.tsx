import { useLogStore } from '../store/useLogStore';
import { t } from '../i18n';
import styles from './LogPage.module.css';
import { useNavigate } from 'react-router-dom';

const LogPage = () => {
  const logs = useLogStore((state) => state.logs);
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>{t('logs.title')}</h1>
      <div className={styles.logBlock}>
        {logs.length === 0 && <p>{t('logs.empty')}</p>}
        {logs.map((log, idx) => (
          <div key={idx} className={`${styles.logEntry} ${styles[log.type] || ''}`}>
            <span>[{log.type.toUpperCase()}]</span> {log.message}
          </div>
        ))}
      </div>
      <button className={styles.button} onClick={() => navigate('/')}>
        {t('logs.toMenu')}
      </button>
    </div>
  );
};

export default LogPage;
