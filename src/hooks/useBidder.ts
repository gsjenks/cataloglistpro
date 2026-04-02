// hooks/useBidder.ts — updated to use sale_id (matches CatalogPro schema)
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { BidderProfile } from "../types/auction";

export function useBidder(saleId: string) {
  const [bidder, setBidder] = useState<BidderProfile | null>(null);
  const [isRegistered, setReg] = useState(false);
  const [isApproved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) {
        setLoading(false);
        return;
      }

      const user = session.user;

      const { data: profile } = await supabase
        .from("bidders")
        .select("id, first_name, last_name, email, paddle_number, is_approved")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile || cancelled) {
        setLoading(false);
        return;
      }
      setBidder(profile);

      const { data: reg } = await supabase
        .from("auction_registrations")
        .select("paddle_number, is_approved")
        .eq("sale_id", saleId)
        .eq("bidder_id", profile.id)
        .maybeSingle();

      if (!cancelled && reg) {
        setReg(true);
        setApproved(reg.is_approved);
        setBidder((prev) =>
          prev ? { ...prev, paddle_number: reg.paddle_number } : prev,
        );
      }

      if (!cancelled) setLoading(false);
    }

    // Run immediately
    load();

    // Re-run on ANY auth state change — including sign-in
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        load();
      }
      if (event === "SIGNED_OUT") {
        setBidder(null);
        setReg(false);
        setApproved(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [saleId]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return error ? { success: false, error: error.message } : { success: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setBidder(null);
    setReg(false);
    setApproved(false);
  };

  return {
    bidder,
    isRegistered,
    isApproved,
    loading,
    canBid: !!bidder && isRegistered && isApproved,
    signIn,
    signOut,
  };
}
