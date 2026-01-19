import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hideSettings } from '../ipcBridge';

const HidePage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    hideSettings();
    navigate('/', { replace: true });
  }, [navigate]);

  return null;  
};

export default HidePage;