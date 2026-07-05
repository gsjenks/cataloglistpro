// src/hooks/useShopper.ts
// A verified shopper's identity, stored per browser. The shopper id becomes the
// basket key (lots.held_by), so registering with the same email/phone on any
// device returns the same basket.

import { useCallback, useState } from 'react';

const ID_KEY = 'shopper_id';
const NAME_KEY = 'shopper_name';
const EMAIL_KEY = 'shopper_email';
const PHONE_KEY = 'shopper_phone';

export function useShopper() {
  const [shopperId, setShopperId] = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [name, setName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));
  const [phone, setPhone] = useState<string | null>(() => localStorage.getItem(PHONE_KEY));

  const register = useCallback(
    (id: string, shopperName: string, shopperEmail?: string | null, shopperPhone?: string | null) => {
      localStorage.setItem(ID_KEY, id);
      localStorage.setItem(NAME_KEY, shopperName);
      if (shopperEmail) localStorage.setItem(EMAIL_KEY, shopperEmail);
      else localStorage.removeItem(EMAIL_KEY);
      if (shopperPhone) localStorage.setItem(PHONE_KEY, shopperPhone);
      else localStorage.removeItem(PHONE_KEY);
      setShopperId(id);
      setName(shopperName);
      setEmail(shopperEmail ?? null);
      setPhone(shopperPhone ?? null);
    },
    [],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PHONE_KEY);
    setShopperId(null);
    setName(null);
    setEmail(null);
    setPhone(null);
  }, []);

  return { shopperId, name, email, phone, isRegistered: !!shopperId, register, signOut };
}
