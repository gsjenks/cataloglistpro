// src/components/ShopperRegistration.tsx
// Two-step shopper registration for self-checkout: enter name + email/phone,
// receive a code (email via Resend or SMS via Twilio), enter it to verify. On
// success the caller gets the verified shopper id (the basket key).

import { useState } from 'react';
import { X } from 'lucide-react';
import { supabasePublic } from '../lib/publicClient';

interface Props {
  saleId: string;
  onVerified: (shopperId: string, name: string) => void;
  onClose: () => void;
}

type Channel = 'email' | 'sms';

export default function ShopperRegistration({ saleId, onVerified, onClose }: Props) {
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('sms');
  const [shopperId, setShopperId] = useState('');
  const [code, setCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = email.trim().length > 0;
  const hasPhone = phone.trim().length > 0;

  const sendCode = async () => {
    setError(null);
    if (!name.trim()) return setError('Please enter your name.');
    if (!hasEmail && !hasPhone) return setError('Enter an email or phone number.');
    // Pick the channel: if only one is given, use it; if both, use the choice.
    const ch: Channel = hasEmail && hasPhone ? channel : hasEmail ? 'email' : 'sms';

    setLoading(true);
    const { data, error: fnErr } = await supabasePublic.functions.invoke('shopper-verify', {
      body: {
        action: 'request',
        saleId,
        name: name.trim(),
        email: hasEmail ? email.trim() : undefined,
        phone: hasPhone ? phone.trim() : undefined,
        channel: ch,
      },
    });
    setLoading(false);
    if (fnErr || !data?.shopperId) {
      setError('Could not send a code. Please check your details and try again.');
      return;
    }
    setShopperId(data.shopperId);
    setTestCode(data.testCode ?? null);
    setChannel(ch);
    setStep('code');
  };

  const verify = async () => {
    setError(null);
    if (code.trim().length < 4) return setError('Enter the code you received.');
    setLoading(true);
    const { data, error: fnErr } = await supabasePublic.functions.invoke('shopper-verify', {
      body: { action: 'verify', shopperId, code: code.trim() },
    });
    setLoading(false);
    if (fnErr || !data?.success) {
      setError(
        data?.error === 'expired'
          ? 'That code expired — send a new one.'
          : 'That code is not correct. Try again.',
      );
      return;
    }
    onVerified(shopperId, data.shopper?.name ?? name.trim());
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'details' ? 'Start shopping' : 'Enter your code'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
        )}

        {step === 'details' ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Register once so your basket follows you on any device. We'll send a code to confirm it's you.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputCls} placeholder="+1 555 123 4567" />
            </div>
            <p className="text-xs text-gray-500">Enter your email or phone (at least one).</p>

            {hasEmail && hasPhone && (
              <div className="flex gap-2 text-sm">
                <span className="text-gray-600 self-center">Send code by:</span>
                {(['email', 'sms'] as Channel[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`px-3 py-1 rounded-md border text-xs font-medium ${
                      channel === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {c === 'email' ? 'Email' : 'Text'}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              We sent a 6-digit code to your {channel === 'sms' ? 'phone' : 'email'}. Enter it below.
            </p>
            {testCode && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                We couldn't deliver your code by {channel === 'sms' ? 'text' : 'email'} automatically. Your code is{' '}
                <strong>{testCode}</strong>
              </div>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              className={`${inputCls} text-center text-2xl tracking-[0.4em]`}
              placeholder="000000"
            />
            <button
              onClick={verify}
              disabled={loading}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button onClick={() => setStep('details')} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
