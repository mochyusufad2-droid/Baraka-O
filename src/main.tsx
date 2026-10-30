import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Daftarkan Service Worker PWA secara otomatis tanpa bergantung pada koneksi WebSocket HMR
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Abaikan jika browser membatasi service worker pada mode tertentu
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
