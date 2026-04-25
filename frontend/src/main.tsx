import React from 'react';
import ReactDOM from 'react-dom/client';
import './bones/registry';
import App from './App';
import 'react-easy-crop/react-easy-crop.css';
import './styles.css';
import './redesign.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
