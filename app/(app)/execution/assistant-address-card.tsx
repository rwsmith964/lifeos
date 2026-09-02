"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ensureAssistantEmailConfigAction } from "./actions";

export function AssistantAddressCard({
  address,
  canManage,
}: {
  address: string | null;
  canManage: boolean;
}) {
  const [currentAddress, setCurrentAddress] = useState(address);
  const [pending, setPending] = useState(false);
  const { showToast } = useToast();

  async function generate() {
    setPending(true);
    try {
      const config = await ensureAssistantEmailConfigAction();
      setCurrentAddress(`${config.alias}@assist.lifeos.app`);
      showToast({ title: "Assistant address created.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't create an address.",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistant address</CardTitle>
        <CardDescription>
          CC or forward things here so the assistant can see them. Nothing is read from this address
          automatically yet — connecting it to your inbox needs a verified sending domain, which isn&apos;t set
          up yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {currentAddress ? (
          <code className="rounded-md border bg-muted px-3 py-1.5 text-sm">{currentAddress}</code>
        ) : (
          <p className="text-sm text-muted-foreground">No assistant address created for this household yet.</p>
        )}
        {!currentAddress && canManage && (
          <Button size="sm" disabled={pending} onClick={generate}>
            {pending ? "Creating…" : "Create an address"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
