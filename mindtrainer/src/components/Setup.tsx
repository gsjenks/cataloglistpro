import { useState } from "react";
import {
  getApiKey,
  getModel,
  MODELS,
  setApiKey,
  setModel,
} from "../lib/settings";

// First-run key entry, and later the Settings panel. `onSaved` closes it.
export function Setup({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [key, setKey] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());

  const save = () => {
    setApiKey(key);
    setModel(model);
    onSaved();
  };

  return (
    <div className="card">
      <h2>{onCancel ? "Settings" : "Welcome to Mind Trainer"}</h2>
      <p className="muted">
        This app teaches you something new every day with a personal AI tutor.
        To power it, paste your Anthropic API key. It's stored only on this
        device and used to talk to Claude directly.
      </p>

      <label style={{ display: "block", fontWeight: 650, margin: "14px 0 6px" }}>
        Anthropic API key
      </label>
      <input
        className="key-input"
        type="password"
        value={key}
        placeholder="sk-ant-..."
        autoComplete="off"
        onChange={(e) => setKey(e.target.value)}
      />
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Get one at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a>
        . Usage is billed to your Anthropic account.
      </p>

      <label style={{ display: "block", fontWeight: 650, margin: "16px 0 6px" }}>
        Model
      </label>
      <select
        className="key-input"
        value={model}
        onChange={(e) => setModelState(e.target.value)}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn" onClick={save} disabled={!key.trim()}>
          Save
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
