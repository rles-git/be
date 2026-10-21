"use client";

import { useState, type FormEvent } from "react";
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

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"error" | "success">("error");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    if (mode === "signup" && password !== confirmPassword) {
      setNoticeType("error");
      setNotice("Your passwords do not match. Please try again.");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setNoticeType("error");
      setNotice("Your password must contain at least 8 characters.");
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
          ...(mode === "signup" ? { fullName, phone } : {}),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Something went wrong. Please try again."
        );
      }

      setNoticeType("success");
      setNotice(
        mode === "signup"
          ? "Your account has been created successfully."
          : "Login successful. Redirecting..."
      );

      if (mode === "signup") {
        // Switch to login if signup doesn't automatically establish a session.
        window.location.assign("/");
      } else {
        window.location.assign("/");
      }
    } catch (error) {
      setNoticeType("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        {/* Decorative panel for larger screens */}
        <section className={styles.illustration}>
          <div className={`${styles.orbit} ${styles.orbitOne}`} />
          <div className={`${styles.orbit} ${styles.orbitTwo}`} />

          <div className={styles.chargeCard}>
            <div className={styles.chargeTop}>
              <div className={styles.miniBrand}>
                <Zap size={17} />
              </div>
              <span className={styles.liveDot}>● LIVE</span>
            </div>

            <div className={styles.bolt}>
              <Zap size={78} strokeWidth={1.2} />
            </div>

            <div className={styles.chargeLine} />
            <div
              className={`${styles.chargeLine} ${styles.short}`}
            />

            <div className={styles.chargeBottom}>
              <span>BE-ELECTRIC</span>
              <span>READY TO GO</span>
            </div>
          </div>

          <div className={styles.floatingPin}>
            <Zap size={15} />
            Smart charging, simplified
          </div>

          <div className={styles.illustrationCopy}>
            <span>DRIVE INTO TOMORROW</span>
            <h2>
              Your journeys,
              <br />
              <em>powered smarter.</em>
            </h2>
            <p>
              Find your next charge and keep moving with
              Be-Electric.
            </p>
          </div>
        </section>

        {/* Authentication panel */}
        <section
          className={`${styles.formPanel} ${
            mode === "login" ? styles.loginPanel : ""
          }`}
        >
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

          {/* Login / signup tabs */}
          <div className={styles.modeSwitch}>
            <button
              type="button"
              className={mode === "login" ? styles.activeMode : ""}
              onClick={() => changeMode("login")}
              aria-pressed={mode === "login"}
            >
              Log in
            </button>

            <button
              type="button"
              className={mode === "signup" ? styles.activeMode : ""}
              onClick={() => changeMode("signup")}
              aria-pressed={mode === "signup"}
            >
              Sign up
            </button>
          </div>

          {/* Authentication form */}
          <form className={styles.form} onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label htmlFor="fullName">Full name</label>

                <div className={styles.inputWrap}>
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    required
                  />
                </div>

                <label htmlFor="phone">Phone number</label>

                <div className={styles.inputWrap}>
                  <Phone size={18} aria-hidden="true" />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+974 0000 0000"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value)
                    }
                  />
                </div>
              </>
            )}

            <label htmlFor="email">Email address</label>

            <div className={styles.inputWrap}>
              <Mail size={18} aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <label htmlFor="password" className={styles.passwordLabel}>
              <span>Password</span>

              {mode === "login" && (
                <span>Keep it secure</span>
              )}
            </label>

            <div className={styles.inputWrap}>
              <LockKeyhole size={18} aria-hidden="true" />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={
                  mode === "signup"
                    ? "At least 8 characters"
                    : "Enter your password"
                }
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
              />

              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
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
                <label htmlFor="confirmPassword">
                  Confirm password
                </label>

                <div className={styles.inputWrap}>
                  <LockKeyhole size={18} aria-hidden="true" />

                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={
                      showConfirmPassword ? "text" : "password"
                    }
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    required
                  />

                  <button
                    type="button"
                    className={styles.eyeButton}
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
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
                  By creating an account, you agree to use
                  Be-Electric responsibly.
                </p>
              </>
            )}

            {notice && (
              <div
                className={`${styles.notice} ${
                  noticeType === "error"
                    ? styles.error
                    : styles.success
                }`}
                role={noticeType === "error" ? "alert" : "status"}
              >
                {notice}
              </div>
            )}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              <span>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Log in"
                    : "Create account"}
              </span>

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Link to switch modes */}
          <p className={styles.switchPrompt}>
            {mode === "login"
              ? "New to Be-Electric?"
              : "Already have an account?"}

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

          {/* Mobile-only inspiration card, shown on login */}
          {mode === "login" && (
            <section className={styles.inspiration}>
              <p className={styles.inspirationTitle}>
                Journey inspiration
              </p>

              <div className={styles.inspirationCard}>
                <div className={styles.inspirationImage}>
                  <span className={styles.inspirationBadge}>
                    <Zap size={12} />
                    A BETTER WAY FORWARD
                  </span>

                  <h2>
                    Your journeys,
                    <br />
                    powered smarter.
                  </h2>
                </div>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
