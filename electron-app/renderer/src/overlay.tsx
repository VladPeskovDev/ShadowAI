import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import './overlay.css';

const INITIAL_SIZE = { width: 900, height: 90 };

// Парсинг Markdown с подсветкой кода
const parseMarkdownCode = (input: string): string => {
  return input.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const cleaned = code.trim();
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(cleaned, { language }).value;

    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
  }).replace(/\n/g, '<br>');
};

const Overlay: React.FC = () => {
  const [history, setHistory] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [hovered, setHovered] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Получение новых сообщений с поддержкой стриминга
  useEffect(() => {
    const bridge = window.overlayBridge;
    
    if (!bridge) {
      console.error('❌ overlayBridge не найден!');
      return;
    }

    bridge.onUpdateText((data: { text: string; isStreaming: boolean }) => {
      //console.log('📩 Получено в overlay:', data);
      
      const { text, isStreaming: streaming } = data;
      
      setIsStreaming(streaming);
      
      if (streaming) {
        // Во время стриминга обновляем последнее сообщение
        setHistory(prev => {
          const newHistory = [...prev];
          if (newHistory.length === 0) {
            newHistory.push(text);
            setCurrentIndex(0);
          } else {
            newHistory[newHistory.length - 1] = text;
          }
          return newHistory;
        });
      } else {
        // Финальное сообщение - фиксируем в истории
        setHistory(prev => {
          const newHistory = [...prev];
          if (newHistory.length === 0) {
            newHistory.push(text);
            setCurrentIndex(0);
          } else {
            newHistory[newHistory.length - 1] = text;
          }
          return newHistory;
        });
      }
    });
  }, []);

  // Изменение размера окна при наведении
  useEffect(() => {
    const bridge = window.overlayBridge;
    const el = containerRef.current;
    if (!bridge || !el) return;

    (async () => {
      const { scrollWidth, scrollHeight } = el;

      if (hovered) {
        await bridge.resizeOverlay(scrollWidth, scrollHeight);
      } else {
        await bridge.resizeOverlay(INITIAL_SIZE.width, INITIAL_SIZE.height);
      }
    })();
  }, [hovered]);

  useEffect(() => {
    const bridge = window.overlayBridge;
    if (!bridge) return;

    (async () => {
      const el = containerRef.current;
      if (!el) return;

      const { scrollWidth, scrollHeight } = el;
      await bridge.resizeOverlay(scrollWidth, scrollHeight);
      
      // Подсветка кода
      requestAnimationFrame(() => {
        document.querySelectorAll('pre code').forEach(block => {
          hljs.highlightElement(block as HTMLElement);
        });
      });
    })();
  }, [currentIndex, history]);

  // Автоскролл и подсветка новых блоков
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;

    requestAnimationFrame(() => {
      document.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block as HTMLElement);
      });
    });
  }, [history, currentIndex]);

  const currentText =
    history.length === 0
      ? '⌛ Ожидание ответа…'
      : history[Math.max(0, currentIndex)];

  return (
    <div
      className="overlay-container"
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isStreaming && <div className="streaming-indicator">⚡ Генерация...</div>}
      
      <div
        key={currentIndex}
        dangerouslySetInnerHTML={{
          __html: parseMarkdownCode(currentText),
        }}
      />

      {history.length > 1 && (
        <div className="nav-buttons">
          <button
            onClick={() => setCurrentIndex(i => Math.max(i - 1, 0))}
            disabled={currentIndex <= 0}
          >
            ◀ Назад
          </button>
          <button
            onClick={() =>
              setCurrentIndex(i => Math.min(i + 1, history.length - 1))
            }
            disabled={currentIndex >= history.length - 1}
          >
            ▶ Вперёд
          </button>
          <button onClick={() => setCurrentIndex(history.length - 1)}>
            ⏩ Последний
          </button>
        </div>
      )}
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<Overlay />);
}