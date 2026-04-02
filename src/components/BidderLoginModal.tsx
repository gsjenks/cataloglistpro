// BidderLoginModal.tsx
// Pops up when "Log in to bid" is clicked.
// Email + password login via Supabase Auth.
// On success, useBidder hook picks up the session automatically.

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onClose:   () => void
  onSuccess: () => void
}

type Mode = 'login' | 'register'

export function BidderLoginModal({ onClose, onSuccess }: Props) {
  const [mode,      setMode]      = useState<Mode>('login')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess('Signed in! Loading your paddle…')
    setTimeout(() => {
      onSuccess()
      onClose()
    }, 800)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authErr) {
      setError(authErr.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Could not create account — please try again.')
      setLoading(false)
      return
    }

    // 2. Create bidder profile
    const { error: profileErr } = await supabase
      .from('bidders')
      .insert({
        user_id:    authData.user.id,
        first_name: firstName,
        last_name:  lastName,
        email:      email,
        is_approved: false,  // clerk must approve
      })

    if (profileErr) {
      // Profile might already exist
      if (!profileErr.message.includes('duplicate')) {
        setError(profileErr.message)
        setLoading(false)
        return
      }
    }

    setSuccess('Account created! The auctioneer will approve your paddle shortly.')
    setLoading(false)
  }

  return (
    <div
      className="blm-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="blm-panel">

        {/* Header */}
        <div className="blm-header">
          <div>
            <div className="blm-title">
              {mode === 'login' ? 'Sign in to bid' : 'Register to bid'}
            </div>
            <div className="blm-subtitle">Benson Auction Services</div>
          </div>
          <button className="blm-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab switcher */}
        <div className="blm-tabs">
          <button
            className={`blm-tab ${mode === 'login' ? 'blm-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(null); setSuccess(null) }}
          >
            Sign In
          </button>
          <button
            className={`blm-tab ${mode === 'register' ? 'blm-tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(null); setSuccess(null) }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form
          className="blm-form"
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
        >
          {mode === 'register' && (
            <div className="blm-row">
              <div className="blm-field">
                <label className="blm-label">First Name</label>
                <input
                  className="blm-input"
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  placeholder="James"
                  autoFocus
                />
              </div>
              <div className="blm-field">
                <label className="blm-label">Last Name</label>
                <input
                  className="blm-input"
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  placeholder="Whitfield"
                />
              </div>
            </div>
          )}

          <div className="blm-field">
            <label className="blm-label">Email</label>
            <input
              className="blm-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="blm-field">
            <label className="blm-label">Password</label>
            <input
              className="blm-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {error && (
            <div className="blm-error">⚠ {error}</div>
          )}

          {success && (
            <div className="blm-success">✓ {success}</div>
          )}

          <button
            className="blm-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait…'
              : mode === 'login'
              ? 'Sign In & Bid'
              : 'Create Account'
            }
          </button>

          {mode === 'register' && (
            <p className="blm-note">
              After registering, the clerk will assign your paddle number.
              You'll be able to bid as soon as you're approved.
            </p>
          )}
        </form>

      </div>
    </div>
  )
}
