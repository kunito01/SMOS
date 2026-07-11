"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> & {
  menuClassName?: string;
  menuMaxWidth?: number;
  menuMinWidth?: number;
};

type SelectOption = {
  disabled: boolean;
  label: ReactNode;
  text: string;
  value: string;
};

type MenuPosition = {
  bottom?: number;
  left: number;
  maxHeight: number;
  top?: number;
  transformOrigin: "bottom" | "top";
  width: number;
};

const textFromNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }

  return "";
};

const collectOptions = (children: ReactNode): SelectOption[] => {
  const options: SelectOption[] = [];

  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) {
        return;
      }

      if (child.type === Fragment || child.type === "optgroup") {
        visit((child.props as { children?: ReactNode }).children);
        return;
      }

      if (child.type !== "option") {
        return;
      }

      const option = child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>;
      const label = option.props.children;
      const text = textFromNode(label).trim();

      options.push({
        disabled: Boolean(option.props.disabled),
        label,
        text,
        value: String(option.props.value ?? text)
      });
    });
  };

  visit(children);
  return options;
};

const normalizeValue = (value: string | readonly string[] | number | undefined) => {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }

  return value === undefined ? undefined : String(value);
};

const findEnabledOption = (options: SelectOption[], start: number, direction: 1 | -1) => {
  if (!options.length) {
    return -1;
  }

  for (let step = 0; step < options.length; step += 1) {
    const index = (start + step * direction + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
};

export function Select({
  children,
  className,
  defaultValue,
  disabled = false,
  id,
  menuClassName,
  menuMaxWidth,
  menuMinWidth,
  onChange,
  value,
  ...nativeProps
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `select-trigger-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const options = useMemo(() => collectOptions(children), [children]);
  const longestOptionText = useMemo(
    () => options.reduce((length, option) => Math.max(length, option.text.length), 0),
    [options]
  );
  const resolvedMenuMinWidth =
    menuMinWidth ?? (longestOptionText > 18 ? 320 : longestOptionText > 8 ? 260 : longestOptionText <= 4 ? 128 : 224);
  const controlledValue = normalizeValue(value);
  const initialValue = normalizeValue(defaultValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const nativeSelectRef = useRef<HTMLSelectElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef({ query: "", timer: 0 });
  const selectedValue =
    controlledValue ?? uncontrolledValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const selectedOption = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useEffect(
    () => () => {
      window.clearTimeout(typeaheadRef.current.timer);
    },
    []
  );

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const bounds = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      Math.min(Math.max(bounds.width, resolvedMenuMinWidth), menuMaxWidth ?? Number.POSITIVE_INFINITY),
      Math.max(0, viewportWidth - viewportPadding * 2)
    );
    const left = Math.min(
      Math.max(bounds.left, viewportPadding),
      Math.max(viewportPadding, viewportWidth - width - viewportPadding)
    );
    const spaceBelow = viewportHeight - bounds.bottom - gap - viewportPadding;
    const spaceAbove = bounds.top - gap - viewportPadding;
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(96, openAbove ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(320, availableHeight);

    setMenuPosition(
      openAbove
        ? {
            bottom: viewportHeight - bounds.top + gap,
            left,
            maxHeight,
            transformOrigin: "bottom",
            width
          }
        : {
            left,
            maxHeight,
            top: bounds.bottom + gap,
            transformOrigin: "top",
            width
          }
    );
  }, [menuMaxWidth, resolvedMenuMinWidth]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const activateOption = useCallback((index: number) => {
    if (index < 0) {
      return;
    }

    setActiveIndex(index);
    window.requestAnimationFrame(() => {
      document.getElementById(`${listboxId}-option-${index}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [listboxId]);

  const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);
  const firstEnabledIndex = findEnabledOption(options, 0, 1);
  const lastEnabledIndex = findEnabledOption(options, options.length - 1, -1);

  const openAtOption = (preference: "current" | "first" | "last") => {
    if (disabled) {
      return;
    }

    setOpen(true);
    if (firstEnabledIndex < 0) {
      setActiveIndex(-1);
      return;
    }

    const index =
      preference === "last"
        ? lastEnabledIndex
        : preference === "first"
          ? firstEnabledIndex
          : selectedIndex >= 0
            ? selectedIndex
            : firstEnabledIndex;

    activateOption(index);
  };

  const chooseOption = (option: SelectOption) => {
    if (disabled || option.disabled) {
      return;
    }

    if (controlledValue === undefined) {
      setUncontrolledValue(option.value);
    }

    const nativeSelect = nativeSelectRef.current;
    if (nativeSelect) {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (valueSetter) {
        valueSetter.call(nativeSelect, option.value);
      } else {
        nativeSelect.value = option.value;
      }
      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const runTypeahead = (key: string, startIndex: number) => {
    const nextQuery = `${typeaheadRef.current.query}${key}`.toLocaleLowerCase();
    typeaheadRef.current.query = nextQuery;
    window.clearTimeout(typeaheadRef.current.timer);
    typeaheadRef.current.timer = window.setTimeout(() => {
      typeaheadRef.current.query = "";
    }, 650);

    for (let step = 1; step <= options.length; step += 1) {
      const index = (startIndex + step + options.length) % options.length;
      const option = options[index];
      if (!option.disabled && option.text.toLocaleLowerCase().startsWith(nextQuery)) {
        activateOption(index);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openAtOption(event.key === "ArrowUp" ? "last" : "current");
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      const start =
        activeIndex >= 0
          ? activeIndex + direction
          : direction === 1
            ? 0
            : options.length - 1;
      activateOption(findEnabledOption(options, start, direction));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openAtOption(event.key === "Home" ? "first" : "last");
    } else if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        chooseOption(option);
      }
    } else if (!open && (event.key === "Enter" || event.key === " ")) {
      return;
    } else if (event.key === "Tab" && open) {
      setOpen(false);
    } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!open) {
        setOpen(true);
      }
      runTypeahead(event.key, activeIndex >= 0 ? activeIndex : selectedIndex);
    }
  };

  const popup =
    mounted && open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={nativeProps["aria-label"]}
            aria-labelledby={
              nativeProps["aria-labelledby"] ?? (nativeProps["aria-label"] ? undefined : triggerId)
            }
            className={cn(
              "smos-dropdown-panel smos-dropdown-enter studio-scroll fixed z-[180] grid gap-1 overflow-y-auto p-1.5",
              menuClassName
            )}
            style={menuPosition}
          >
            {options.length ? (
              options.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedValue === option.value}
                  disabled={option.disabled}
                  tabIndex={-1}
                  title={option.text || undefined}
                  onClick={() => chooseOption(option)}
                  onPointerEnter={() => {
                    if (!option.disabled) {
                      setActiveIndex(index);
                    }
                  }}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-[1rem] px-3 py-2 text-left text-xs font-light leading-[1.35] text-ink outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-coral/50 disabled:cursor-not-allowed disabled:opacity-45",
                    selectedValue === option.value && "bg-[#ffc700]",
                    activeIndex === index && selectedValue !== option.value && "bg-white"
                  )}
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>
                  {selectedValue === option.value ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                </button>
              ))
            ) : (
              <div
                role="option"
                aria-disabled="true"
                aria-selected={false}
                className="px-3 py-2 text-xs font-light text-muted"
              >
                —
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-describedby={nativeProps["aria-describedby"]}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={nativeProps["aria-invalid"]}
        aria-label={nativeProps["aria-label"]}
        aria-labelledby={nativeProps["aria-labelledby"]}
        aria-required={nativeProps.required}
        disabled={disabled}
        title={selectedOption?.text || undefined}
        data-jelly-control="true"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          triggerRef.current?.focus();
          openAtOption("current");
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-full border-0 bg-white px-4 py-2 text-left text-ink shadow-soft outline-none ring-1 ring-black/[0.06] transition duration-150 hover:bg-aqua disabled:cursor-not-allowed disabled:opacity-50",
          className,
          "text-[13px] font-light leading-5 focus:ring-2 focus:ring-coral/50 focus-visible:ring-2 focus-visible:ring-coral/50",
          open && "bg-aqua focus:bg-aqua"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? "—"}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>

      <select
        {...nativeProps}
        ref={nativeSelectRef}
        id={`${triggerId}-native`}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        onInvalid={(event) => {
          nativeProps.onInvalid?.(event);
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        onChange={(event) => {
          if (controlledValue === undefined) {
            setUncontrolledValue(event.target.value);
          }
          onChange?.(event);
        }}
        hidden
        tabIndex={-1}
        aria-hidden="true"
      >
        {children}
      </select>
      {popup}
    </div>
  );
}
