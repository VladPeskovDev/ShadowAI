import { createHashRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import FAQPage from './pages/FAQPage';
import ExitPage from './pages/ExitPage';
import LogPage from './pages/LogPage';
import LogListener from './components/LogListener';
import HidePage from './pages/HidePage';
import SessionPage from './pages/SessionPage';

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/faq', element: <FAQPage /> },
      { path: '/hide', element: <HidePage /> }, 
      { path: '/exit', element: <ExitPage /> },
      { path: '/logs', element: <LogPage /> },
      { path: '/session', element: <SessionPage /> },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <LogListener /> 
    </>
  );
}