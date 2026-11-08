"use client";

import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectPlatform, navigationLinks, type MobilePlatform } from "@/lib/reminders/departures";

export function NavigateButtons({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const [platform, setPlatform] = useState<MobilePlatform>("other");

  useEffect(() => {
    // The platform is only known in the browser; render the generic link until then.
    void Promise.resolve().then(() => setPlatform(detectPlatform(navigator.userAgent)));
  }, []);

  const links = navigationLinks({ lat, lng, label }, platform);

  return (
    <div className="flex flex-col gap-3">
      <Button asChild size="lg" className="h-14 text-base">
        <a href={links.native}>
          <Navigation className="size-5" /> Navigate
        </a>
      </Button>
      <p className="font-sans text-metadata text-meta">Or open in:</p>
      <div className="flex flex-wrap gap-2">
        {platform === "ios" && (
          <Button asChild variant="outline" size="sm">
            <a href={links.apple}>Apple Maps</a>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <a href={links.google} target="_blank" rel="noreferrer">
            Google Maps
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={links.waze} target="_blank" rel="noreferrer">
            Waze
          </a>
        </Button>
      </div>
    </div>
  );
}
