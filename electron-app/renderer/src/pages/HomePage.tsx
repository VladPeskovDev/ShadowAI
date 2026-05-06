import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, toggleLang, getLang } from '../i18n';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();
  const [sessionActive, setSessionActive] = useState(false);
  const [lang, setLang] = useState(getLang());

  useEffect(() => {
    window.electronAPI.getCallSessionStatus().then(setSessionActive);
  }, []);

  const handleStopSession = () => {
    window.electronAPI.stopCallSession();
    setSessionActive(false);
  };

  const handleToggleLang = () => {
    const newLang = toggleLang();
    setLang(newLang);
  };

  return (
    <div className="home">
      <div className="home-header">
        <h1 className="home-title">ShadowAI</h1>
        <span className="home-version">v2.0</span>
      </div>

      <div className="home-nav">
        {sessionActive ? (
          <button className="home-btn stop" onClick={handleStopSession}>
            {t('home.stopSession')}
          </button>
        ) : (
          <button className="home-btn accent" onClick={() => navigate('/session')}>
            {t('home.startSession')}
          </button>
        )}
        <button className="home-btn primary" onClick={() => navigate('/settings')}>
          {t('home.settings')}
        </button>
        <div className="home-row">
          <button className="home-btn secondary" onClick={() => navigate('/faq')}>
            {t('home.faq')}
          </button>
          <button className="home-btn secondary" onClick={() => navigate('/logs')}>
            {t('home.logs')}
          </button>
        </div>
      </div>

      <div className="home-footer">
        <button className="home-btn ghost" onClick={handleToggleLang}>
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
        <button className="home-btn ghost" onClick={() => navigate('/hide')}>
          {t('home.hide')}
        </button>
        <button className="home-btn ghost danger" onClick={() => navigate('/exit')}>
          {t('home.exit')}
        </button>
      </div>
    </div>
  );
};

export default HomePage;
