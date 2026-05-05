import { useNavigate } from 'react-router-dom';
import styles from './FAQPage.module.css';

const FAQPage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Горячие клавиши</h1>
      <div className={styles.textBlock}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Хоткей</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><kbd>Cmd+Shift+S</kbd></td>
              <td>Открыть / скрыть настройки</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+D</kbd></td>
              <td>Показать / скрыть overlay с ответом</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+C</kbd></td>
              <td>Call mode — непрерывная фоновая запись (вкл/выкл)</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Enter</kbd></td>
              <td>В call mode: отправить контекст в GPT (whisper не нужен, текст уже готов). Иначе: начать/остановить запись</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Left</kbd></td>
              <td>Скриншот — OCR + отправка в GPT</td>
            </tr>
            <tr>
              <td><kbd>Cmd+Shift+P</kbd></td>
              <td>Периодические скриншоты в Telegram (вкл/выкл)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className={styles.subtitle}>Режимы</h2>
      <div className={styles.textBlock}>
        <p><strong>Обычный режим</strong> — Cmd+Enter для записи, повторно для остановки. Whisper расшифрует, GPT ответит в overlay.</p>
        <p><strong>Call mode</strong> — запускается через UI (Начать сессию) или Cmd+Shift+C. Непрерывная запись + транскрипция в реальном времени. Cmd+Enter — подсказка мгновенно (текст уже расшифрован). Стенограмма сохраняется в ~/Documents/ShadowAI/.</p>
        <p><strong>Скриншот</strong> — Cmd+Left делает снимок, OCR распознаёт текст, GPT отвечает. Знает контекст разговора.</p>
      </div>

      <button className={styles.button} onClick={() => navigate('/')}>В меню</button>
    </div>
  );
};

export default FAQPage;
