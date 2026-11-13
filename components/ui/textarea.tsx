"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// Redesign: same token set as Input (radius-input, surface/line/ink, action focus ring).
//
// Grows with its content so everything typed stays visible (no hidden text
// behind an internal scrollbar), up to 60% of the screen height; past that it
// scrolls. The height is recalculated on every keystroke and whenever the
// value changes from outside (e.g. voice dictation appending text).
function Textarea({ className, onInput, ref, ...props }: React.ComponentProps<"textarea">) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    },
    [ref]
  );

  // Re-measure after every render: covers controlled value changes from
  // outside the textarea and the first paint with pre-filled text.
  React.useLayoutEffect(() => {
    resize();
  });

  return (
    <textarea
      ref={setRefs}
      data-slot="textarea"
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      className={cn(
        "flex min-h-16 max-h-[60dvh] w-full resize-none overflow-y-auto rounded-input border border-line bg-surface px-3 py-2 font-sans text-body text-ink outline-none motion-safe-transition placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50 focus-visible:border-line-strong disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
