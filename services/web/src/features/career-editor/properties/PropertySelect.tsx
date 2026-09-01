"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon } from "@/components/ui/Icon";

import styles from "./properties.module.css";

export interface PropertySelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MenuPosition { top: number; left: number; width: number; maxHeight: number }

export function PropertySelect({ label, value, options, placeholder, disabled = false, onChange }: {
  label: string;
  value: string;
  options: readonly PropertySelectOption[];
  placeholder: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const viewportGap = 10;
    const gap = 5;
    const desiredHeight = Math.min(menuRef.current?.scrollHeight ?? 220, 220);
    const roomBelow = window.innerHeight - anchor.bottom - gap - viewportGap;
    const roomAbove = anchor.top - gap - viewportGap;
    const openAbove = roomBelow < Math.min(desiredHeight, 140) && roomAbove > roomBelow;
    const maxHeight = Math.max(96, Math.min(220, openAbove ? roomAbove : roomBelow));
    const top = openAbove ? Math.max(viewportGap, anchor.top - Math.min(desiredHeight, maxHeight) - gap) : anchor.bottom + gap;
    const width = Math.min(Math.max(anchor.width, 180), window.innerWidth - viewportGap * 2);
    const left = Math.min(Math.max(viewportGap, anchor.left), window.innerWidth - width - viewportGap);
    setPosition({ top: Math.round(top), left: Math.round(left), width: Math.round(width), maxHeight: Math.round(maxHeight) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionMenu();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open, positionMenu]);

  function showMenu() {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab" && open) {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        showMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + options.length) % options.length);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      select(activeIndex);
    }
  }

  const menu = open ? <div
    ref={menuRef}
    id={listboxId}
    className={styles.propertySelectMenu}
    style={position ? { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight } as CSSProperties : { visibility: "hidden" }}
    role="listbox"
    aria-label={`${label} 선택`}
    data-property-floating-layer
  >
    {options.map((option, index) => <button
      key={option.value}
      type="button"
      role="option"
      aria-selected={option.value === value}
      data-active={index === activeIndex ? "true" : "false"}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => select(index)}
    >
      <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
      {option.value === value ? <Icon name="check" size={14} weight="bold" /> : null}
    </button>)}
  </div> : null;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={styles.propertySelect}
      aria-label={label}
      aria-haspopup="listbox"
      aria-controls={open ? listboxId : undefined}
      aria-expanded={open}
      disabled={disabled}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={handleKeyDown}
    >
      <span data-placeholder={selected ? "false" : "true"}>{selected?.label ?? placeholder}</span>
      <Icon name={open ? "caret-up" : "caret-down"} size={13} />
    </button>
    {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
  </>;
}
