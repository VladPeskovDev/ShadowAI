import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import styles from './SessionPage.module.css';

type SessionMode = 'interview' | 'translator' | 'meeting';

const SessionPage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<SessionMode>('interview');
  const [autoVAD, setAutoVAD] = useState(false);

  const modes: { id: SessionMode; label: string; desc: string }[] = [
    { id: 'interview', label: t('session.interview'), desc: t('session.interviewDesc') },
    { id: 'translator', label: t('session.translator'), desc: t('session.translatorDesc') },
    { id: 'meeting', label: t('session.meeting'), desc: t('session.meetingDesc') },
  ];

  const handleStart = () => {
    const sessionTitle = title.trim() || t('session.untitled');
    window.electronAPI.startCallSession({
      title: sessionTitle,
      description: description.trim(),
      mode,
      autoVAD,
    });
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>{t('session.title')}</h1>

      <div className={styles.formGroup}>
        <label className={styles.label}>{t('session.mode')}</label>
        <div className={styles.modeGroup}>
          {modes.map((m) => (
            <button
              key={m.id}
              className={`${styles.modeBtn} ${mode === m.id ? styles.modeBtnActive : ''}`}
              onClick={() => setMode(m.id)}
            >
              <span className={styles.modeLabel}>{m.label}</span>
              <span className={styles.modeDesc}>{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>{t('session.name')}</label>
        <input
          type="text"
          className={styles.input}
          placeholder={t('session.namePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>{t('session.description')}</label>
        <textarea
          className={styles.textarea}
          placeholder={t('session.descPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.checkboxGroup} onClick={() => setAutoVAD(!autoVAD)}>
        <div className={`${styles.checkbox} ${autoVAD ? styles.checkboxActive : ''}`} />
        <div>
          <span className={styles.checkboxLabel}>{t('session.autoVAD')}</span>
          <span className={styles.checkboxDesc}>{t('session.autoVADDesc')}</span>
        </div>
      </div>

      <button className={styles.startBtn} onClick={handleStart}>
        {t('session.start')}
      </button>
      <button className={styles.backBtn} onClick={() => navigate('/')}>
        {t('session.back')}
      </button>
    </div>
  );
};

export default SessionPage;
