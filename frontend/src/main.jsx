import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// React Root Mount
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 🔥 Remove loader ONLY AFTER React is fully mounted
window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  const root = document.getElementById("root");

  // Fade out loader smoothly
  setTimeout(() => {
    if (loader) loader.classList.add("hidden");
    if (root) root.style.opacity = "1";
  }, 500); // adjust slowdown here
});
