// src/hooks/useShopper.ts
// A verified shopper's identity, stored per browser. The shopper id is the
// basket key (lots.held_by) and appears in basket links, but it is NOT a
// credential: holds and basket reads require the random token issued by the
// shopper-verify function at verification (only its hash is stored server-side).
// Registering with the same email/phone on another device returns the same
// shopper, so the basket follows the person.

import { useCallback, useState } from 'react';

const ID_KEY = 'shopper_id';
const TOKEN_KEY = 'shopper_token';
const NAME_KEY = 'shopper_name';
const EMAIL_KEY = 'shopper_email';
const PHONE_KEY = 'shopper_phone';

const ALL_KEYS = [ID_KEY, TOKEN_KEY, NAME_KEY, EMAIL_KEY, PHONE_KEY];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Shoppers verified before tokens existed hold only a bare id, which no longer
// opens anything. Clear it so they are asked to verify once more.
function dropLegacyIdentity() {
  try {
    if (localStorage.getItem(ID_KEY) && !localStorage.getItem(TOKEN_KEY)) {
      ALL_KEYS.forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    /* storage unavailable */
  }
}

export function useShopper() {
  const [shopperId, setShopperId] = useState<string | null>(() => {
    dropLegacyIdentity();
    return read(ID_KEY);
  });
  const [token, setToken] = useState<string | null>(() => read(TOKEN_KEY));
  const [name, setName] = useState<string | null>(() => read(NAME_KEY));
  const [email, setEmail] = useState<string | null>(() => read(EMAIL_KEY));
  const [phone, setPhone] = useState<string | null>(() => read(PHONE_KEY));

  const register = useCallback(
    (
      id: string,
      shopperToken: string,
      shopperName: string,
      shopperEmail?: string | null,
      shopperPhone?: string | null,
    ) => {
      localStorage.setItem(ID_KEY, id);
      localStorage.setItem(TOKEN_KEY, shopperToken);
      localStorage.setItem(NAME_KEY, shopperName);
      if (shopperEmail) localStorage.setItem(EMAIL_KEY, shopperEmail);
      else localStorage.removeItem(EMAIL_KEY);
      if (shopperPhone) localStorage.setItem(PHONE_KEY, shopperPhone);
      else localStorage.removeItem(PHONE_KEY);
      setShopperId(id);
      setToken(shopperToken);
      setName(shopperName);
      setEmail(shopperEmail ?? null);
      setPhone(shopperPhone ?? null);
    },
    [],
  );

  const signOut = useCallback(() => {
    ALL_KEYS.forEach((k) => localStorage.removeItem(k));
    setShopperId(null);
    setToken(null);
    setName(null);
    setEmail(null);
    setPhone(null);
  }, []);

  return { shopperId, token, name, email, phone, isRegistered: !!token, register, signOut };
}
