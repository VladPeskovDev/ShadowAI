import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import styles from './FAQPage.module.css';

const FAQPage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('faq.title')}</h1>
      <div className={styles.textBlock}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('faq.hotkey')}</th>
              <th>{t('faq.action')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><kbd>Cmd+Shift+S</kbd></td>
              <td>{t('faq.openSettings')}</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+D</kbd></td>
              <td>{t('faq.showOverlay')}</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+C</kbd></td>
              <td>{t('faq.callMode')}</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Enter</kbd></td>
              <td>{t('faq.cmdEnter')}</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Left</kbd></td>
              <td>{t('faq.screenshot')}</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+P</kbd></td>
              <td>{t('faq.periodic')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className={styles.subtitle}>{t('faq.modes')}</h2>
      <div className={styles.textBlock}>
        <p><strong>{t('faq.normalMode')}</strong> — {t('faq.normalModeDesc')}</p>
        <p><strong>Call mode</strong> — {t('faq.callModeDesc')}</p>
        <p><strong>{t('faq.screenshotMode')}</strong> — {t('faq.screenshotModeDesc')}</p>
      </div>

      <button className={styles.button} onClick={() => navigate('/')}>{t('faq.toMenu')}</button>
    </div>
  );
};

export default FAQPage;
