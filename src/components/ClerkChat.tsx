// ClerkChat.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

interface ChatMessage {
  id: string;
  sender_name: string;
  message: string;
  is_clerk: boolean;
  created_at: string;
  bidder_id: string | null;
}

interface Props {
  saleId: string;
  compact?: boolean;
}

export function ClerkChat({ saleId, compact = false }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_name, message, is_clerk, created_at, bidder_id")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages(data ?? []);
  }, [saleId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${saleId}`)
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
          if (collapsed && !msg.is_clerk) setUnread((u) => u + 1);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [saleId, collapsed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      sale_id: saleId,
      sender_name: "Clerk",
      message: reply.trim(),
      is_clerk: true,
      bidder_id: null,
    });
    setReply("");
    setSending(false);
  };

  // Compact mode — used inside column 3 fixed-height box
  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                color: "#bbb",
                fontSize: 11,
                textAlign: "center",
                marginTop: 12,
              }}
            >
              No messages yet
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.is_clerk ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "88%",
                    background: msg.is_clerk ? "#1a1a1a" : "#f0f0f0",
                    color: msg.is_clerk ? "#fff" : "#1a1a1a",
                    borderRadius: msg.is_clerk
                      ? "8px 8px 0 8px"
                      : "8px 8px 8px 0",
                    padding: "5px 9px",
                    fontSize: 11,
                    lineHeight: 1.4,
                  }}
                >
                  {!msg.is_clerk && (
                    <div
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: "#888",
                        marginBottom: 1,
                      }}
                    >
                      {msg.sender_name}
                    </div>
                  )}
                  {msg.message}
                </div>
                <div style={{ fontSize: 8, color: "#bbb", marginTop: 1 }}>
                  {new Date(msg.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        <div
          style={{
            padding: "6px 8px",
            borderTop: "1px solid #f0f0f0",
            display: "flex",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendReply();
            }}
            placeholder="Reply to bidders…"
            style={{
              flex: 1,
              padding: "6px 10px",
              border: "1.5px solid #ddd",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "DM Sans, sans-serif",
              outline: "none",
            }}
          />
          <button
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            style={{
              background: "#1a1a1a",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "0 12px",
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
              opacity: !reply.trim() ? 0.4 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  // Standard collapsible mode (non-compact)
  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,.08)",
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          background: "#1a1a1a",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: "#c9a84c",
              fontWeight: 700,
              fontSize: 12,
              fontFamily: "DM Sans, sans-serif",
              letterSpacing: ".05em",
            }}
          >
            💬 BIDDER CHAT
          </span>
          {unread > 0 && (
            <span
              style={{
                background: "#cc2200",
                color: "#fff",
                borderRadius: 10,
                fontSize: 9,
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              {unread} new
            </span>
          )}
        </div>
        <span style={{ color: "rgba(255,255,255,.5)", fontSize: 10 }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>

      {!collapsed && (
        <>
          <div
            style={{
              height: 200,
              overflowY: "auto",
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  color: "#bbb",
                  fontSize: 11,
                  fontFamily: "DM Sans, sans-serif",
                  textAlign: "center",
                  marginTop: 16,
                }}
              >
                No messages yet
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.is_clerk ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      background: msg.is_clerk ? "#1a1a1a" : "#f0f0f0",
                      color: msg.is_clerk ? "#fff" : "#1a1a1a",
                      borderRadius: msg.is_clerk
                        ? "8px 8px 0 8px"
                        : "8px 8px 8px 0",
                      padding: "6px 10px",
                      fontSize: 12,
                      fontFamily: "DM Sans, sans-serif",
                      lineHeight: 1.4,
                    }}
                  >
                    {!msg.is_clerk && (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#888",
                          marginBottom: 2,
                        }}
                      >
                        {msg.sender_name}
                      </div>
                    )}
                    {msg.message}
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      color: "#bbb",
                      marginTop: 2,
                      fontFamily: "DM Sans, sans-serif",
                    }}
                  >
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          <div
            style={{
              padding: "6px 8px",
              borderTop: "1px solid #f0f0f0",
              display: "flex",
              gap: 6,
            }}
          >
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendReply();
              }}
              placeholder="Reply to bidders…"
              style={{
                flex: 1,
                padding: "7px 10px",
                border: "1.5px solid #ddd",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
              }}
            />
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              style={{
                background: "#1a1a1a",
                border: "none",
                borderRadius: 4,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "0 12px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                opacity: !reply.trim() ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
