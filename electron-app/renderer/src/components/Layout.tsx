import { Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => {
  return (
    <div className="layout">
      <div className="title-bar" />
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;