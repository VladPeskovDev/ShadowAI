import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home">
      <div className="home-header">
        <h1 className="home-title">ShadowAI</h1>
        <span className="home-version">v2.0</span>
      </div>

      <div className="home-nav">
        <button className="home-btn primary" onClick={() => navigate('/settings')}>
          Настройки
        </button>
        <div className="home-row">
          <button className="home-btn secondary" onClick={() => navigate('/faq')}>
            FAQ
          </button>
          <button className="home-btn secondary" onClick={() => navigate('/logs')}>
            Логи
          </button>
        </div>
      </div>

      <div className="home-footer">
        <button className="home-btn ghost" onClick={() => navigate('/hide')}>
          Скрыть
        </button>
        <button className="home-btn ghost danger" onClick={() => navigate('/exit')}>
          Выход
        </button>
      </div>
    </div>
  );
};

export default HomePage;
