import React, { useState } from "react";
import {
  Eye,
  EyeOff
} from "lucide-react";
import { confirmPasswordReset } from "firebase/auth";
import { auth as primaryAuth, track } from "../../firebase";

export function ResetPasswordPage({ oobCode, onDone }) {
  // primaryAuth and confirmPasswordReset are both in scope from the
  // top-level static imports in App.jsx — no separate import needed here.
  const [newPw,    setNewPw]    = React.useState('');
  const [confirmPw,setConfirmPw]= React.useState('');
  const [showPw,   setShowPw]   = React.useState(false);
  const [busy,     setBusy]     = React.useState(false);
  const [done,     setDone]     = React.useState(false);
  const [err,      setErr]      = React.useState('');

  const BRAND = '#6d5df5';

  const pwRules = {
    length:    newPw.length >= 6 && newPw.length <= 25,
    hasLetter: /[a-zA-Z]/.test(newPw),
    hasNumber: /[0-9]/.test(newPw),
  };
  const pwOk = pwRules.length && pwRules.hasLetter && pwRules.hasNumber;

  const handleReset = async () => {
    if (!pwOk)                    { setErr('Password must be 6–25 characters with a letter and number.'); return; }
    if (newPw !== confirmPw)      { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      // primaryAuth is the same Firebase auth instance used throughout App.jsx
      await confirmPasswordReset(primaryAuth, oobCode, newPw);
      track('password_reset_completed');
      setDone(true);
    } catch (e) {
      if (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code') {
        setErr('This reset link has expired or already been used. Please request a new one.');
      } else if (e.code === 'auth/weak-password') {
        setErr('Password must be at least 6 characters.');
      } else {
        setErr('Something went wrong. Please try again or contact support.');
      }
      setBusy(false);
    }
  };

  const inp = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e8e8f2', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5fb', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '36px 32px',
        width: '100%', maxWidth: 420, boxShadow: '0 4px 32px rgba(109,93,245,.13)',
      }}>
        {/* Logo / header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `linear-gradient(135deg,${BRAND},#9a55ee)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: 24,
          }}>🔐</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#13142b', marginBottom: 4 }}>
            {done ? 'Password updated!' : 'Choose a new password'}
          </div>
          <div style={{ fontSize: 14, color: '#8a8daa' }}>
            {done
              ? 'You can now sign in with your new password.'
              : 'Enter a new password for your myInvestorCircle account.'}
          </div>
        </div>

        {done ? (
          /* ── Success state ── */
          <>
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: 12, padding: '16px 18px', marginBottom: 24, textAlign: 'center',
              fontSize: 13, color: '#166534', lineHeight: 1.6,
            }}>
              ✅ Your password has been reset successfully.
            </div>
            <button
              onClick={onDone}
              style={{
                width: '100%', padding: 13, borderRadius: 11,
                background: `linear-gradient(120deg,${BRAND},#9a55ee 55%,#cf52d8)`,
                border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Sign in →
            </button>
          </>
        ) : (
          /* ── Form state ── */
          <>
            {/* New password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#4a4d6a', marginBottom: 6 }}>
                New password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); setErr(''); }}
                  placeholder="At least 6 characters"
                  maxLength={25}
                  autoFocus
                  style={{ ...inp, paddingRight: 44 }}
                />
                <button
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8a8daa', padding: 2 }}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {/* Password rules checklist */}
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { key: 'length',    met: pwRules.length,    text: '6–25 characters' },
                  { key: 'hasLetter', met: pwRules.hasLetter, text: 'At least one letter (a–z)' },
                  { key: 'hasNumber', met: pwRules.hasNumber, text: 'At least one number (0–9)' },
                ].map(({ key, met, text }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                      background: met ? '#38a16920' : '#f2f2fa',
                      color: met ? '#38a169' : '#b0b3cc',
                      border: `1px solid ${met ? '#38a169' : '#dde0f0'}`,
                    }}>
                      {met ? '✓' : '·'}
                    </span>
                    <span style={{ color: met ? '#38a169' : '#8a8daa' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#4a4d6a', marginBottom: 6 }}>
                Confirm new password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                placeholder="••••••••"
                maxLength={25}
                style={inp}
              />
              {confirmPw.length > 0 && confirmPw !== newPw && (
                <div style={{ fontSize: 12, color: '#c53030', marginTop: 4 }}>Passwords do not match</div>
              )}
              {confirmPw.length > 0 && confirmPw === newPw && pwOk && (
                <div style={{ fontSize: 12, color: '#38a169', marginTop: 4 }}>✓ Passwords match</div>
              )}
            </div>

            {err && (
              <div style={{
                background: '#fff3f3', border: '1px solid #ffd0d0', borderRadius: 10,
                padding: '10px 13px', marginBottom: 16, fontSize: 13, color: '#c53030',
                display: 'flex', gap: 8,
              }}>
                <span>⚠</span><span>{err}</span>
              </div>
            )}

            <button
              onClick={handleReset}
              disabled={!pwOk || newPw !== confirmPw || busy}
              style={{
                width: '100%', padding: 13, borderRadius: 11,
                background: `linear-gradient(120deg,${BRAND},#9a55ee 55%,#cf52d8)`,
                border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: (!pwOk || newPw !== confirmPw || busy) ? 'not-allowed' : 'pointer',
                opacity: (!pwOk || newPw !== confirmPw || busy) ? 0.55 : 1,
                fontFamily: 'inherit', transition: 'opacity .15s',
              }}>
              {busy ? 'Updating password…' : 'Set new password →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
