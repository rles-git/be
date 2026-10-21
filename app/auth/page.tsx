"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound, Zap } from "lucide-react";
import styles from "./auth.module.css";

type Mode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  function changeMode(next: Mode) {
    setMode(next);
    setNotice(null);
    setPassword("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setNotice({ type: "success", text: mode === "signup" ? "Your account is ready. Welcome to Be-Electric!" : "You're signed in. Welcome back!" });
      // Change this destination if your app uses a different home route.
      window.location.assign("/");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to connect. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Be-Electric home">
          <span className={styles.brandIcon}><Zap size={20} fill="currentColor" /></span>
          <span>be-electric</span>
        </a>
        <span className={styles.secure}><LockKeyhole size={14} /> Secure access</span>
      </div>

      <section className={styles.content}>
        <div className={styles.illustration} aria-hidden="true">
          <div className={styles.orbit orbitOne} /><div className={styles.orbit orbitTwo} />
          <div className={styles.chargeCard}>
            <div className={styles.chargeTop}><span className={styles.miniBrand}><Zap size={15} /></span><span className={styles.liveDot}>NETWORK READY</span></div>
            <div className={styles.bolt}><Zap size={58} fill="currentColor" strokeWidth={1.5} /></div>
            <div className={styles.chargeLine} /><div className={styles.chargeLine short} />
            <div className={styles.chargeBottom}><span>BE-ELECTRIC NETWORK</span><span>⚡</span></div>
          </div>
          <div className={styles.floatingPin}><Zap size={17} fill="currentColor" /> Charging made simple</div>
          <div className={styles.illustrationCopy}><span>EV CHARGING, SIMPLIFIED</span><h2>Every journey<br />starts with a <em>charge.</em></h2><p>Find stations, plan your route, and keep moving with Be-Electric.</p></div>
        </div>

        <div className={styles.formPanel}>
          <button className={styles.backButton} type="button" onClick={() => window.location.assign("/")}><ArrowLeft size={16} /> Back to explore</button>
          <div className={styles.formHeading}><span className={styles.eyebrow}>{mode === "login" ? "WELCOME BACK" : "JOIN THE NETWORK"}</span><h1>{mode === "login" ? "Good to see you." : "Create your account."}</h1><p>{mode === "login" ? "Sign in to continue your electric journey." : "Your next journey is just a few details away."}</p></div>
          <div className={styles.modeSwitch} role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? styles.activeMode : ""} onClick={() => changeMode("login")}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? styles.activeMode : ""} onClick={() => changeMode("signup")}>Sign up</button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {mode === "signup" && <>
              <label htmlFor="fullName">Full name</label>
              <div className={styles.inputWrap}><UserRound size={18} /><input id="fullName" name="fullName" autoComplete="name" placeholder="Enter your full name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={150} /></div>
              <label htmlFor="phone">Phone number <span>(optional)</span></label>
              <div className={styles.inputWrap}><Phone size={18} /><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+974 0000 0000" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} /></div>
            </>}
            <label htmlFor="email">Email address</label>
            <div className={styles.inputWrap}><Mail size={18} /><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} /></div>
            <div className={styles.passwordLabel}><label htmlFor="password">Password</label>{mode === "login" && <span>Keep it secure</span>}</div>
            <div className={styles.inputWrap}><LockKeyhole size={18} /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "signup" ? 8 : 1} maxLength={128} /><button className={styles.eyeButton} type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {mode === "signup" && <p className={styles.terms}>By creating an account, you agree to use Be-Electric responsibly.</p>}
            {notice && <div className={`${styles.notice} ${notice.type === "error" ? styles.error : styles.success}`} role="status">{notice.text}</div>}
            <button className={styles.submitButton} type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}<ArrowRight size={18} /></button>
          </form>
          <p className={styles.switchPrompt}>{mode === "login" ? "New to Be-Electric?" : "Already have an account?"} <button type="button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create account" : "Log in"}</button></p>
          <div className={styles.formFooter}><span /> Your journeys, powered smarter <span /></div>
        </div>
      </section>
    </main>
  );
}
