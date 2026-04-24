'use client';

import { useState, useEffect, useCallback } from 'react';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_KEY = 'admin_session';

export interface AdminAuthState {
  user: string;
  pin: string;
  loginError: string;
  loginLoading: boolean;
}

export function useAdminAuth() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Restore session on mount so a refresh doesn't bounce the user back to login
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed?.name && parsed?.token) {
        setUser(parsed.name);
        setLastActivity(Date.now());
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Session expiry — auto-logout after 30 min inactive
  useEffect(() => {
    if (!user) return;
    const check = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        setUser('');
        setPin('');
      }
    }, 30_000);
    const resetTimer = () => setLastActivity(Date.now());
    window.addEventListener('click', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      clearInterval(check);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [user, lastActivity]);

  const handleLogin = useCallback(async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.name && data.token) {
        try {
          sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ name: data.name, token: data.token })
          );
          console.log('admin session stored');
        } catch { /* ignore storage failure */ }
        setUser(data.name);
        setLastActivity(Date.now());
      } else {
        setLoginError(data.error || 'Invalid PIN');
      }
    } catch {
      setLoginError('Connection error. Try again.');
    }
    setLoginLoading(false);
  }, [pin]);

  const logout = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setUser('');
    setPin('');
    setLoginError('');
  }, []);

  return {
    pin,
    setPin,
    user,
    loginError,
    loginLoading,
    handleLogin,
    logout,
  };
}
