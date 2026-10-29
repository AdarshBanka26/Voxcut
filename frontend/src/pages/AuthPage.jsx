import React, { useState } from 'react';
import { Icon, Notice, SiteFooter, SiteHeader } from '../components/chrome.jsx';
import { login, register, takeNext } from '../auth.js';
import { links } from '../router.js';

function Field({ label, type = 'text', value, onChange, autoComplete, hint, error, ...rest }) {
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">{label}</span>
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={Boolean(error)}
        className={`px-4 py-3 rounded-xl bg-surface-container-low border outline-none font-body-md text-body-md transition-colors ${error ? 'border-error' : 'border-surface-container focus:border-secondary'}`} {...rest} />
      {(error || hint) && <span className={`font-body-sm text-body-sm ${error ? 'text-error' : 'text-on-surface-variant'}`}>{error || hint}</span>}
    </label>
  );
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const e = {};
    if (isRegister && !name.trim()) e.name = 'Tell us what to call you.';
    if (!/^\S+@\S+\.\S{2,}$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (isRegister && password.length < 8) e.password = 'Use at least 8 characters.';
    if (!isRegister && !password) e.password = 'Enter your password.';
    setFieldErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      window.location.hash = takeNext() || links.studio();
    } catch (err) {
      setError(err);
      if (err.code === 'EMAIL_TAKEN') setFieldErrors({ email: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased">
      <SiteHeader />
      <main className="w-full pt-16 bg-surface-bright min-h-screen">
        <div className="max-w-6xl mx-auto px-margin-mobile md:px-margin py-space-xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <div className="relative hidden lg:block rounded-2xl overflow-hidden min-h-[560px] shadow-sm">
            <img src={isRegister ? '/assets/art-layers.jpg' : '/assets/art-ribbons.jpg'} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/70 via-transparent to-transparent" />
            <span className="absolute top-5 left-5 px-2.5 py-1 rounded-full bg-surface-container-lowest/90 font-label-code text-label-code uppercase tracking-wider">Studio Engine · v2.4</span>
            <div className="absolute bottom-6 left-6 right-6 p-5 rounded-xl bg-inverse-surface/60 backdrop-blur-md text-inverse-on-surface">
              <p className="font-serif text-[26px] leading-9 italic">“Edit the text. Rewrite the video.”</p>
              <p className="font-label-code text-label-code mt-2 opacity-80 uppercase">Delete a word · the cut follows · your source stays untouched</p>
            </div>
          </div>

          <section className="bg-surface-container-lowest rounded-2xl shadow-sm p-6 sm:p-10 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-widest">{isRegister ? 'New Account' : 'Welcome Back'}</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg md:text-[44px] md:leading-[52px] tracking-tight">{isRegister ? 'Create your studio' : 'Sign in to Voxcut'}</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1 mb-6">{isRegister ? 'Your projects, transcripts and exports stay private to your account.' : 'Pick up your edits where you left them.'}</p>

            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              {error && error.code !== 'EMAIL_TAKEN' && <Notice title={isRegister ? 'Could not create the account' : 'Could not sign in'} onClose={() => setError(null)}>{error.message}</Notice>}
              {isRegister && <Field label="Name" value={name} onChange={setName} autoComplete="name" maxLength={80} error={fieldErrors.name} />}
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" maxLength={254} error={fieldErrors.email} />
              <div className="relative">
                <Field label="Password" type={show ? 'text' : 'password'} value={password} onChange={setPassword} maxLength={128}
                  autoComplete={isRegister ? 'new-password' : 'current-password'} error={fieldErrors.password} hint={isRegister ? 'At least 8 characters.' : undefined} />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-[38px] text-on-surface-variant hover:text-on-surface">
                  <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[20px]" />
                </button>
              </div>
              <button type="submit" disabled={busy} className="mt-2 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary-container text-on-primary-container font-body-lg text-body-lg font-semibold shadow-cta hover:bg-primary transition-all disabled:opacity-60">
                {busy ? <Icon name="progress_activity" className="animate-spin text-[20px]" /> : <Icon name={isRegister ? 'person_add' : 'login'} className="text-[20px]" />}
                {busy ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}
              </button>
            </form>

            <p className="mt-6 font-body-md text-body-md text-on-surface-variant text-center">
              {isRegister ? 'Already have an account? ' : 'New to Voxcut? '}
              <a href={isRegister ? '#/login' : '#/register'} className="text-secondary font-semibold hover:underline">{isRegister ? 'Sign in' : 'Create an account'}</a>
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
