import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import { SaveProvider } from './context/SaveContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaveProvider>
      <App />
    </SaveProvider>
  </StrictMode>,
);
