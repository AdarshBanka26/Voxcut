import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useRoute } from './router.js';
import Landing from './pages/Landing.jsx';
import Templates from './pages/Templates.jsx';
import ExportStudio from './pages/ExportStudio.jsx';
import Welcome from './studio/Welcome.jsx';
import Editor from './studio/Editor.jsx';

function App() {
  const { page, params, anchor } = useRoute();
  if (page === 'templates') return <Templates />;
  if (page === 'export') return <ExportStudio key={params[0] ?? 'none'} projectId={params[0]} />;
  if (page === 'studio') return params[0] ? <Editor key={params[0]} projectId={params[0]} /> : <Welcome />;
  return <Landing anchor={anchor} />;
}

createRoot(document.getElementById('root')).render(<App />);
