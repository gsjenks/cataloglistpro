// BidderChat.tsx
// Floating chat widget for bidders in the auction room.
// Bidders can ask questions, clerk replies appear in real time.

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { BidderProfile } from "../types/auction";

interface ChatMessage {
  id: string;
  sender_name: string;
  message: string;
  is_clerk: boolean;
  created_at: string;
}

interface Props {
  saleId: string;
  bidder: BidderProfile | null;
}

export function BidderChat({ saleId, bidder }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_name, message, is_clerk, created_at")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages(data ?? []);
  }, [saleId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`bidder-chat:${saleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `sale_id=eq.${saleId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, msg]);
          if (!open && msg.is_clerk) setUnread((u) => u + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [saleId, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    }
  }, [open, messages]);

  const sendMessage = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const name = bidder
      ? `${bidder.first_name} (Paddle #${bidder.paddle_number ?? "?"})`
      : "Guest";
    await supabase.from("chat_messages").insert({
      sale_id: saleId,
      sender_name: name,
      message: text.trim(),
      is_clerk: false,
      bidder_id: bidder?.id ?? null,
    });
    setText("");
    setSending(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 14,
        zIndex: 50,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* Chat window */}
      {open && (
        <div
          style={{
            width: 300,
            marginBottom: 8,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,.35)",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,.1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "#1a1a1a",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "2px solid #c9a84c",
            }}
          >
            <span
              style={{
                color: "#c9a84c",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: ".04em",
              }}
            >
              💬 Ask the Auctioneer
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,.5)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              height: 220,
              overflowY: "auto",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  color: "#bbb",
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                Send a message to the auctioneer
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.is_clerk ? "flex-start" : "flex-end",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      background: msg.is_clerk ? "#f06a00" : "#f0f0f0",
                      color: msg.is_clerk ? "#fff" : "#1a1a1a",
                      borderRadius: msg.is_clerk
                        ? "8px 8px 8px 0"
                        : "8px 8px 0 8px",
                      padding: "7px 10px",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {msg.is_clerk && (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "rgba(255,255,255,.7)",
                          marginBottom: 2,
                        }}
                      >
                        🔨 AUCTIONEER
                      </div>
                    )}
                    {msg.message}
                  </div>
                  <div style={{ fontSize: 8, color: "#bbb", marginTop: 2 }}>
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "8px",
              borderTop: "1px solid #f0f0f0",
              display: "flex",
              gap: 6,
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder={bidder ? "Ask a question…" : "Log in to chat"}
              disabled={!bidder}
              style={{
                flex: 1,
                padding: "7px 10px",
                border: "1.5px solid #ddd",
                borderRadius: 4,
                fontSize: 12,
                outline: "none",
                fontFamily: "DM Sans, sans-serif",
                opacity: !bidder ? 0.5 : 1,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !text.trim() || !bidder}
              style={{
                background: "#f06a00",
                border: "none",
                borderRadius: 4,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "0 12px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                opacity: !text.trim() || !bidder ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: open ? "#1a1a1a" : "#f06a00",
          border: "none",
          color: "#fff",
          fontSize: 20,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        💬
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              background: "#cc2200",
              color: "#fff",
              borderRadius: "50%",
              width: 18,
              height: 18,
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "pulse .8s infinite",
            }}
          >
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
