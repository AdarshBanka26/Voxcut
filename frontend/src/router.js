import { useEffect, useState } from 'react';

// Hash routes: #/, #/templates, #/studio, #/studio/:projectId, #/export/:projectId.
// An in-page anchor like #features is treated as the landing page.

function parse() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith('/')) return { page: 'landing', params: [], anchor: hash };
  const [page = '', ...params] = hash.slice(1).split('/').filter(Boolean);
  return { page: page || 'landing', params, anchor: '' };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) return;
  window.location.hash = path;
  window.scrollTo(0, 0);
}

export const links = {
  home: '#/',
  templates: '#/templates',
  studio: id => (id ? `#/studio/${id}` : '#/studio'),
  exportPage: id => (id ? `#/export/${id}` : '#/export')
};
