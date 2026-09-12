import { useState } from "react";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login, error } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(pin);
    } catch {
      // error is surfaced via context
    } finally {
      setBusy(false);
      setPin("");
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h2>ikorka-packaging</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Аналітика упаковки та доставок</p>
        <input
          className="input pin-input"
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        <button className="btn" type="submit" disabled={busy || !pin} style={{ width: "100%" }}>
          {busy ? "Вхід..." : "Увійти"}
        </button>
        {error && <div className="error-text">{error}</div>}
      </form>
    </div>
  );
}
