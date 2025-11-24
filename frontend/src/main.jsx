import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Mount React App
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 🔥 Smooth loader removal after React mounts fully
window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  const root = document.getElementById("root");

  // Wait to create elegant fade
  setTimeout(() => {
    if (loader) loader.classList.add("hidden"); // fades out via CSS
    if (root) root.style.opacity = "1"; // fade-in React root
  }, 1200); 
});
