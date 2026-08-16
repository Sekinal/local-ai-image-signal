import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';
import '../shared.css';

const root = document.getElementById('root');
if (!root) throw new Error('Popup root is missing.');
createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
