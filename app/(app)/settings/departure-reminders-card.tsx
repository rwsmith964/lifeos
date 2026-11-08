"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DEPARTURE_REMINDERS_PREF_KEY,
  departureRemindersEnabled,
  isDepartureRemindersAvailable,
  requestDepartureReminderPermission,
  syncDepartureReminders,
} from "@/components/native/departure-reminders";

export function DepartureRemindersCard() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Capacitor and localStorage only exist in the browser.
    void Promise.resolve().then(() => {
      setAvailable(isDepartureRemindersAvailable());
      setEnabled(departureRemindersEnabled());
    });
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    const granted = await requestDepartureReminderPermission();
    if (!granted) {
      setMessage("Notifications are blocked for LifeOS. Turn them on in your phone's Settings, then try again.");
      setBusy(false);
      return;
    }
    try {
      localStorage.setItem(DEPARTURE_REMINDERS_PREF_KEY, "on");
    } catch {
      // Without storage the choice can't be remembered, but reminders still sync this session.
    }
    setEnabled(true);
    const count = await syncDepartureReminders().catch(() => 0);
    setMessage(count > 0 ? `Scheduled ${count} reminders for your upcoming drives.` : "On. You'll be reminded before drives on your calendar.");
    setBusy(false);
  }

  async function turnOff() {
    try {
      localStorage.setItem(DEPARTURE_REMINDERS_PREF_KEY, "off");
    } catch {
      // ignore
    }
    setEnabled(false);
    setMessage("Reminders are off. Ones already scheduled may still appear until they pass.");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-metadata text-ink-2">Departure reminders</h2>
            <p className="font-sans text-metadata text-meta">
              A reminder 15 minutes before you need to leave, and another when it&apos;s time to go, with a button to start navigation.
            </p>
          </div>
          {available ? (
            enabled ? (
              <Button size="sm" variant="outline" onClick={() => void turnOff()}>
                Turn off
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
                {busy ? "Turning on…" : "Turn on"}
              </Button>
            )
          ) : null}
        </div>
        {!available && <p className="font-sans text-metadata text-meta">Available in the LifeOS phone app.</p>}
        {message && <p className="font-sans text-metadata text-ink-2">{message}</p>}
      </CardContent>
    </Card>
  );
}
