"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { BiometricAuth, BiometryError, BiometryErrorType } from "@aparajita/capacitor-biometric-auth";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Gates the authenticated app shell behind Face ID / Touch ID / device
 * biometrics when running inside the native Capacitor shell.
 *
 * Fires on every app open per Richard's decision (D-100): a cold launch AND
 * every time the app returns to the foreground from the background, not
 * just once per install. Deliberately does nothing at all in a normal
 * browser — `Capacitor.isNativePlatform()` is false there, so the entire
 * lock/unlock flow is skipped and children render immediately. This means
 * the public production website is completely unaffected by this feature.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(isNative);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const authenticate = useCallback(async () => {
    if (!isNative) return;
    setChecking(true);
    setError(null);
    try {
      await BiometricAuth.authenticate({
        reason: "Unlock LifeOS",
        cancelTitle: "Cancel",
        allowDeviceCredential: true,
        androidTitle: "Unlock LifeOS",
      });
      setLocked(false);
    } catch (e) {
      const err = e as BiometryError;
      // A user who cancels, or a device with no biometrics/passcode
      // enrolled at all, should not be permanently locked out of their own
      // data — only a real authentication *failure* keeps the lock up.
      if (
        err?.code === BiometryErrorType.biometryNotAvailable ||
        err?.code === BiometryErrorType.biometryNotEnrolled ||
        err?.code === BiometryErrorType.userCancel
      ) {
        setLocked(false);
        return;
      }
      setError(err?.message ?? "Authentication failed. Try again.");
    } finally {
      setChecking(false);
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;

    // Cold launch — deferred to a fresh task so no setState call happens
    // synchronously inside the effect body itself (react-hooks/set-state-in-effect).
    const coldLaunchTimer = setTimeout(() => void authenticate(), 0);

    // Re-lock and re-prompt every time the app comes back to the
    // foreground — matches "on every app open," not just app installs.
    const listenerPromise = CapacitorApp.addListener("resume", () => {
      setLocked(true);
      void authenticate();
    });

    return () => {
      clearTimeout(coldLaunchTimer);
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [isNative, authenticate]);

  if (!isNative || !locked) return <>{children}</>;

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <Fingerprint className="size-10 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold">LifeOS is locked</p>
        <p className="mt-1 text-xs text-muted-foreground">Use Face ID, Touch ID, or your device passcode to continue.</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={() => void authenticate()} disabled={checking}>
        {checking ? "Checking…" : "Unlock"}
      </Button>
    </div>
  );
}
