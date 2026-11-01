"use client";

import { useSyncExternalStore } from "react";

// Per-device preferences. Auto-confirm defaults to OFF (SPEC §4 step 7).
const AUTO_CONFIRM = "auto-confirm";
const EVENT = "settings-change";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getAutoConfirm() {
  return read(AUTO_CONFIRM) === "1";
}

export function setAutoConfirm(on: boolean) {
  try {
    localStorage.setItem(AUTO_CONFIRM, on ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useAutoConfirm() {
  return useSyncExternalStore(subscribe, getAutoConfirm, () => false);
}
