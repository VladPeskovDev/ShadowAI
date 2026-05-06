import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import './overlay.css';

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 400;
const WIDTH = 900;

const parseMarkdownCode = (input: string): string => {
  return input
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const cleaned = code.trim();
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(cleaned, { language }).value;
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
    })
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
};

const Overlay: React.FC = () => {
  const [history, setHistory] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isStreaming, setIsStreaming] = useState(false);
  const [compact, setCompact] = useState(false);
  const [fadeClass, setFadeClass] = useState('');
  const [canScroll, setCanScroll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Receive messages
  useEffect(() => {
    const bridge = window.overlayBridge;
    if (!bridge) return;

    bridge.onUpdateText((data: { text: string; isStreaming: boolean }) => {
      const { text, isStreaming: streaming } = data;

      setIsStreaming(streaming);
      setCompact(false);
      setFadeClass('fade-in');

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
    });
  }, []);

  // Auto-resize based on content
  useEffect(() => {
    const bridge = window.overlayBridge;
    const el = containerRef.current;
    if (!bridge || !el) return;

    requestAnimationFrame(async () => {
      const contentHeight = el.scrollHeight;
      const clampedHeight = Math.min(Math.max(contentHeight + 4, MIN_HEIGHT), compact ? 60 : MAX_HEIGHT);
      await bridge.resizeOverlay(WIDTH, clampedHeight);

      setCanScroll(el.scrollHeight > el.clientHeight);
    });
  }, [history, currentIndex, compact]);

  // Auto-scroll during streaming
  useEffect(() => {
    const el = containerRef.current;
    if (el && isStreaming) {
      el.scrollTop = el.scrollHeight;
    }
  }, [history, isStreaming]);

  // Highlight code blocks
  useEffect(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block as HTMLElement);
      });
    });
  }, [history, currentIndex]);

  // Auto-compact after inactivity (collapse after 30s of no streaming)
  useEffect(() => {
    if (isStreaming) return;

    const timer = setTimeout(() => {
      setCompact(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, [isStreaming, history]);

  const currentText =
    history.length === 0
      ? ''
      : history[Math.max(0, currentIndex)];

  const isEmpty = history.length === 0;

  return (
    <div
      className={`overlay-container ${fadeClass} ${compact ? 'compact' : ''}`}
      ref={containerRef}
      onClick={() => compact && setCompact(false)}
    >
      {isStreaming && <div className="streaming-indicator">Generating...</div>}

      {isEmpty ? (
        <div className="waiting-text">Waiting...</div>
      ) : (
        <div
          className="response-text"
          key={currentIndex}
          dangerouslySetInnerHTML={{
            __html: parseMarkdownCode(currentText),
          }}
        />
      )}

      {canScroll && !isStreaming && (
        <div className="scroll-indicator">scroll</div>
      )}

      {history.length > 1 && !compact && (
        <div className="nav-buttons">
          <button
            onClick={() => setCurrentIndex(i => Math.max(i - 1, 0))}
            disabled={currentIndex <= 0}
          >
            Back
          </button>
          <button
            onClick={() => setCurrentIndex(i => Math.min(i + 1, history.length - 1))}
            disabled={currentIndex >= history.length - 1}
          >
            Next
          </button>
          <button onClick={() => setCurrentIndex(history.length - 1)}>
            Latest
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
