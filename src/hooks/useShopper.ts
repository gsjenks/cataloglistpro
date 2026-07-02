// src/hooks/useShopper.ts
// A verified shopper's identity, stored per browser. The shopper id becomes the
// basket key (lots.held_by), so registering with the same email/phone on any
// device returns the same basket.

import { useCallback, useState } from 'react';

const ID_KEY = 'shopper_id';
const NAME_KEY = 'shopper_name';

export function useShopper() {
  const [shopperId, setShopperId] = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [name, setName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));

  const register = useCallback((id: string, shopperName: string) => {
    localStorage.setItem(ID_KEY, id);
    localStorage.setItem(NAME_KEY, shopperName);
    setShopperId(id);
    setName(shopperName);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    setShopperId(null);
    setName(null);
  }, []);

  return { shopperId, name, isRegistered: !!shopperId, register, signOut };
}
