"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "theme";
const EVENT = "theme-change";
const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const LABEL: Record<ThemeChoice, string> = { system: "ตามระบบ", light: "สว่าง", dark: "มืด" };

function read(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  const choice = useSyncExternalStore<ThemeChoice>(subscribe, read, () => "system");

  function next() {
    const n = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    try {
      if (n === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, n);
    } catch {
      /* storage disabled: theme still applies for this page load */
    }
    apply(n);
    window.dispatchEvent(new Event(EVENT));
  }

  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={next}
      aria-label={`ธีม: ${LABEL[choice]} (กดเพื่อเปลี่ยน)`}
      title={`ธีม: ${LABEL[choice]}`}
      className="size-9 text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-4" />
    </Button>
  );
}
