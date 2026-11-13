"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { BiometricAuth, BiometryError, BiometryErrorType } from "@aparajita/capacitor-biometric-auth";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";

// Remembered for the life of the app's web view (cleared when the app is closed), so moving
// between pages -- which can rebuild this component -- doesn't ask for Face ID again.
const UNLOCKED_KEY = "famwise:app-unlocked";
const AWAY_SINCE_KEY = "famwise:away-since";
// Short interruptions (the Face ID sheet itself, the photo picker, a notification pull-down)
// don't count as leaving the app. Being away longer than this locks it again.
const RELOCK_AFTER_AWAY_MS = 60_000;

function readFlag(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable: falls back to asking each time the component is built.
  }
}

/**
 * Gates the authenticated app shell behind Face ID / Touch ID / device
 * biometrics when running inside the native Capacitor shell.
 *
 * Asks on a cold launch, and again when the app comes back to the foreground after
 * being away for a minute or more (D-100). It does not ask again just because you
 * moved to another page or the phone briefly took over the screen. Deliberately does
 * nothing at all in a normal browser — `Capacitor.isNativePlatform()` is false there,
 * so the entire lock/unlock flow is skipped and children render immediately.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(() => isNative && readFlag(UNLOCKED_KEY) !== "1");
  const lockedAtMount = useRef(locked);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const authenticate = useCallback(async () => {
    if (!isNative) return;
    setChecking(true);
    setError(null);
    try {
      await BiometricAuth.authenticate({
        reason: "Unlock Famwise",
        cancelTitle: "Cancel",
        allowDeviceCredential: true,
        androidTitle: "Unlock Famwise",
      });
      writeFlag(UNLOCKED_KEY, "1");
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
        writeFlag(UNLOCKED_KEY, "1");
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

    // Cold launch -- only when not already unlocked this session. Deferred to a fresh task so
    // no setState call happens synchronously inside the effect body itself.
    const coldLaunchTimer = lockedAtMount.current ? setTimeout(() => void authenticate(), 0) : undefined;

    // Note when the app leaves the foreground; lock again on return only if it was away a while.
    const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        writeFlag(AWAY_SINCE_KEY, String(Date.now()));
        return;
      }
      const awaySince = Number(readFlag(AWAY_SINCE_KEY));
      writeFlag(AWAY_SINCE_KEY, null);
      if (!awaySince || Date.now() - awaySince < RELOCK_AFTER_AWAY_MS) return;
      writeFlag(UNLOCKED_KEY, null);
      setLocked(true);
      void authenticate();
    });

    return () => {
      if (coldLaunchTimer) clearTimeout(coldLaunchTimer);
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [isNative, authenticate]);

  if (!isNative || !locked) return <>{children}</>;

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <Fingerprint className="size-10 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold">Famwise is locked</p>
        <p className="mt-1 text-xs text-muted-foreground">Use Face ID, Touch ID, or your device passcode to continue.</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={() => void authenticate()} disabled={checking}>
        {checking ? "Checking…" : "Unlock"}
      </Button>
    </div>
  );
}
