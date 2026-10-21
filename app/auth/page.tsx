
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
  Zap,
} from "lucide-react";
import styles from "./auth.module.css";

type Mode = "login" | "signup";

type Notice = {
  type: "error" | "success";
  text: string;
};

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setNotice({
        type: "error",
        text: "Passwords do not match. Please try again.",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/stations/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Request failed (${response.status}). Please try again.`
        );
      }

      setNotice({
        type: "success",
        text:
          mode === "signup"
            ? "Your account is ready. Welcome to Be-Electric!"
            : "You're signed in. Welcome back!",
      });

      window.location.assign("/");
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to connect. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <div className={styles.illustration} aria-hidden="true">
          <div className={`${styles.orbit} ${styles.orbitOne}`} />
          <div className={`${styles.orbit} ${styles.orbitTwo}`} />

          <div className={styles.chargeCard}>
            <div className={styles.chargeTop}>
              <span className={styles.miniBrand}>
                <Zap size={15} />
              </span>
              <span className={styles.liveDot}>NETWORK READY</span>
            </div>

            <div className={styles.bolt}>
              <Zap size={58} fill="currentColor" strokeWidth={1.5} />
            </div>

            <div className={styles.chargeLine} />
            <div className={`${styles.chargeLine} ${styles.short}`} />

            <div className={styles.chargeBottom}>
              <span>BE-ELECTRIC NETWORK</span>
              <span>⚡</span>
            </div>
          </div>

          <div className={styles.floatingPin}>
            <Zap size={17} fill="currentColor" />
            Charging made simple
          </div>

          <div className={styles.illustrationCopy}>
            <span>EV CHARGING, SIMPLIFIED</span>
            <h2>
              Every journey
              <br />
              starts with a <em>charge.</em>
            </h2>
            <p>
              Find stations, plan your route, and keep moving with
              Be-Electric.
            </p>
          </div>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHeading}>
            <span className={styles.eyebrow}>
              {mode === "login" ? "WELCOME BACK" : "JOIN THE NETWORK"}
            </span>

            <h1>
              {mode === "login"
                ? "Good to see you."
                : "Create your account."}
            </h1>

            <p>
              {mode === "login"
                ? "Sign in to continue your electric journey."
                : "Your next journey is just a few details away."}
            </p>
          </div>

          <div
            className={styles.modeSwitch}
            role="tablist"
            aria-label="Account access"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? styles.activeMode : ""}
              onClick={() => changeMode("login")}
            >
              Log in
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? styles.activeMode : ""}
              onClick={() => changeMode("signup")}
            >
              Sign up
            </button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label htmlFor="fullName">Full name</label>

                <div className={styles.inputWrap}>
                  <UserRound size={18} />

                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    maxLength={150}
                  />
                </div>

                <label htmlFor="phone">
                  Phone number
                </label>

                <div className={styles.inputWrap}>
                  <Phone size={18} />

                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+974 0000 0000"
                    value={phone}
                    required
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={30}
                  />
                </div>
              </>
            )}

            <label htmlFor="email">Email address</label>

            <div className={styles.inputWrap}>
              <Mail size={18} />

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={255}
              />
            </div>

            <div className={styles.passwordLabel}>
              <label htmlFor="password">Password</label>

              {mode === "login" && <span>Keep it secure</span>}
            </div>

            <div className={styles.inputWrap}>
              <LockKeyhole size={18} />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                placeholder={
                  mode === "login"
                    ? "Enter your password"
                    : "At least 8 characters"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "signup" ? 8 : 1}
                maxLength={128}
              />

              <button
                className={styles.eyeButton}
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>

            {mode === "signup" && (
              <>
                <label htmlFor="confirmPassword">Confirm password</label>

                <div className={styles.inputWrap}>
                  <LockKeyhole size={18} />

                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    required
                    minLength={8}
                    maxLength={128}
                  />

                  <button
                    className={styles.eyeButton}
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword((previous) => !previous)
                    }
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>

                <p className={styles.terms}>
                  By creating an account, you agree to use Be-Electric
                  responsibly.
                </p>
              </>
            )}

            {notice && (
              <div
                className={`${styles.notice} ${
                  notice.type === "error"
                    ? styles.error
                    : styles.success
                }`}
                role="status"
                aria-live="polite"
              >
                {notice.text}
              </div>
            )}

            <button
              className={styles.submitButton}
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Create account"}

              <ArrowRight size={18} />
            </button>
          </form>

          <p className={styles.switchPrompt}>
            {mode === "login"
              ? "New to Be-Electric?"
              : "Already have an account?"}{" "}

            <button
              type="button"
              onClick={() =>
                changeMode(mode === "login" ? "signup" : "login")
              }
            >
              {mode === "login" ? "Create account" : "Log in"}
            </button>
          </p>

          <div className={styles.formFooter}>
            <span />
            Your journeys, powered smarter
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}
