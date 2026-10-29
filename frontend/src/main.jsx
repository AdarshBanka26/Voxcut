import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useRoute } from './router.js';
import { bootstrapSession, rememberNext, useSession } from './auth.js';
import { Icon } from './components/chrome.jsx';
import Landing from './pages/Landing.jsx';
import Templates from './pages/Templates.jsx';
import ExportStudio from './pages/ExportStudio.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Welcome from './studio/Welcome.jsx';
import Editor from './studio/Editor.jsx';

const PROTECTED = new Set(['studio', 'export']);

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center gap-3 text-on-surface-variant bg-surface-bright" role="status">
      <Icon name="progress_activity" className="animate-spin" /> Restoring your session…
    </div>
  );
}

/** Sends signed-out visitors to login and remembers where they were going. */
function Protected({ children }) {
  const session = useSession();
  useEffect(() => {
    if (session.status === 'anonymous') {
      rememberNext(window.location.hash);
      window.location.hash = '#/login';
    }
  }, [session.status]);
  return session.status === 'authenticated' ? children : <Loading />;
}

function App() {
  const { page, params, anchor } = useRoute();
  const session = useSession();

  useEffect(() => {
    if ((page === 'login' || page === 'register') && session.status === 'authenticated') window.location.hash = '#/studio';
  }, [page, session.status]);

  if (page === 'login' || page === 'register') return session.status === 'loading' ? <Loading /> : <AuthPage key={page} mode={page} />;
  if (page === 'templates') return <Templates />;
  if (PROTECTED.has(page)) {
    return (
      <Protected>
        {page === 'export'
          ? <ExportStudio key={params[0] ?? 'none'} projectId={params[0]} />
          : params[0] ? <Editor key={params[0]} projectId={params[0]} /> : <Welcome />}
      </Protected>
    );
  }
  return <Landing anchor={anchor} />;
}

bootstrapSession();
createRoot(document.getElementById('root')).render(<App />);
