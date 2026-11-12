import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { ChevronDown } from "lucide-react";
import Avatar from "./Avatar";
import type { SelectOption } from "../types";

interface SelectMenuProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  hint?: string | null;
  triggerRef?: RefObject<HTMLButtonElement>;
}

/**
 * The ePortal's settings listbox: a bordered glass trigger over an animated
 * dark menu. Keeping the options as buttons (rather than a native select)
 * lets the menu use the portal material in every browser.
 */
export default function SelectMenu({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  loadingLabel = "Loading…",
  loading = false,
  disabled = false,
  hint = null,
  triggerRef,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = `${id}-options`;

  const selected = options.find((option) => option.value === value);
  const labelText = selected ? selected.label : value || placeholder;
  const showPlaceholder = !selected && !value;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (menuRef.current) menuRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    if (disabled || loading) setOpen(false);
  }, [disabled, loading]);

  function focusOption(index: number) {
    const items = optionRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null
    );
    if (!items.length) return;
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    items[clamped]?.focus({ preventScroll: true });
  }

  function openMenu() {
    if (disabled || loading) return;
    const rect = triggerRef?.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setPlacement(spaceBelow < 260 && spaceAbove > spaceBelow ? "top" : "bottom");
    }
    setOpen(true);
    requestAnimationFrame(() => {
      const index = options.findIndex((option) => option.value === value);
      focusOption(index >= 0 ? index : 0);
    });
  }

  function close(focusTrigger = false) {
    setOpen(false);
    if (focusTrigger) triggerRef?.current?.focus();
  }

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef?.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      openMenu();
    } else if (event.key === "Escape") {
      close();
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = optionRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(items.length - 1);
    } else if ((event.key === "Enter" || event.key === " ") && index >= 0) {
      event.preventDefault();
      choose(options[index]);
    }
  }

  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="picker-select" ref={wrapperRef}>
        <button
          type="button"
          id={id}
          ref={triggerRef}
          className="picker-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${id}-label`}
          disabled={disabled || loading}
          onClick={() => (open ? close(true) : openMenu())}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="picker-value">
            {selected?.avatar ? <Avatar {...selected.avatar} /> : null}
            <span className={showPlaceholder ? "picker-placeholder" : undefined}>
              {loading ? loadingLabel : labelText}
            </span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className="picker-chevron"
          />
        </button>
        <div
          className="picker-menu"
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          data-state={open ? "open" : "closed"}
          data-placement={placement}
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {options.length ? (
            options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className="picker-option"
                tabIndex={-1}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                onClick={() => choose(option)}
              >
                <span className="picker-option-value">
                  {option.avatar ? <Avatar {...option.avatar} /> : null}
                  <span>{option.label}</span>
                </span>
              </button>
            ))
          ) : (
            <span className="picker-empty">No options</span>
          )}
        </div>
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
