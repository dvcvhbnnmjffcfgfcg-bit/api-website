/**
 * Web Vite entry point. Mounts the React app and attaches the Tailwind stylesheet.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './tailwind.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}