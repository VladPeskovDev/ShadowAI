import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SessionPage.module.css';

type SessionMode = 'interview' | 'translator' | 'meeting';

const modes: { id: SessionMode; label: string; desc: string }[] = [
  { id: 'interview', label: 'Собеседование', desc: 'Подсказки на вопросы собеседника' },
  { id: 'translator', label: 'Переводчик', desc: 'Перевод + ответы на RU и EN' },
  { id: 'meeting', label: 'Встреча', desc: 'Запись и summary созвона' },
];

const SessionPage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<SessionMode>('interview');

  const handleStart = () => {
    const sessionTitle = title.trim() || 'Без названия';
    window.electronAPI.startCallSession({
      title: sessionTitle,
      description: description.trim(),
      mode,
    });
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Подготовка к сессии</h1>

      <div className={styles.formGroup}>
        <label className={styles.label}>Режим</label>
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
        <label className={styles.label}>Название</label>
        <input
          type="text"
          className={styles.input}
          placeholder="Собес Backend Яндекс"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Описание (необязательно)</label>
        <textarea
          className={styles.textarea}
          placeholder="Второй этап, технический..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <button className={styles.startBtn} onClick={handleStart}>
        Начать сессию
      </button>
      <button className={styles.backBtn} onClick={() => navigate('/')}>
        Назад
      </button>
    </div>
  );
};

export default SessionPage;
