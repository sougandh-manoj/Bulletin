"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import {
  DELIVERY_FREQUENCIES,
  DELIVERY_FREQUENCY_LABELS,
  getCanonicalIndianRegion,
  INDIAN_REGIONS,
  LANGUAGE_LABELS,
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  PRODUCT,
  storyCountRange,
  SUPPORTED_LANGUAGES,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type NewsCategory,
  type Weekday,
} from "@/config/product";
import {
  createInitialDraft,
  ONBOARDING_DRAFT_KEY,
  parseStoredDraft,
  serializeDraft,
  validateCompleteDraft,
  validateStep,
  type FieldErrors,
  type OnboardingDraft,
} from "@/lib/onboarding/draft";

import {
  CATEGORY_TONE,
  FREQUENCY_DESCRIPTIONS,
  getCountryOptions,
  getTimezoneOptions,
  STEP_CONTENT,
} from "./onboarding-data";
import styles from "./onboarding.module.css";

type EmailCheckState = "idle" | "checking" | "existing" | "pending";
type ResendState = "idle" | "sending" | "success" | "error";
type TimePeriod = "AM" | "PM";
type TimePart = "hour" | "minute" | "period";

const TIME_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PERIODS: TimePeriod[] = ["AM", "PM"];

const FIELD_IDS: Record<string, string> = {
  name: "name",
  email: "email",
  countryCode: "country",
  stateRegion: "state-region",
  city: "city",
  language: "language-english",
  timezone: "timezone",
  categories: "category-india",
  customTopics: "custom-topic-input",
  excludedTopics: "excluded-topic-input",
  storyCount: "story-count",
  frequency: "frequency-daily",
  weeklyDay: "weekly-day",
  deliveryTime: "delivery-time",
  consent: "consent",
};

function detectTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone === "Asia/Calcutta" ? "Asia/Kolkata" : timezone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function formatTime(value: string) {
  const [hour = "8", minute = "00"] = value.split(":");
  const numericHour = Number(hour);
  const suffix = numericHour >= 12 ? "PM" : "AM";
  const displayHour = numericHour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function parseTime(value: string) {
  const [rawHour = "8", rawMinute = "00"] = value.split(":");
  const numericHour = Number(rawHour);
  const numericMinute = Number(rawMinute);
  const safeHour = Number.isInteger(numericHour) && numericHour >= 0 && numericHour <= 23
    ? numericHour
    : 8;
  const safeMinute = Number.isInteger(numericMinute) && numericMinute >= 0 && numericMinute <= 59
    ? numericMinute
    : 0;

  return {
    hour: safeHour % 12 || 12,
    minute: safeMinute,
    period: (safeHour >= 12 ? "PM" : "AM") as TimePeriod,
  };
}

function serializeTime(hour: number, minute: number, period: TimePeriod) {
  const hour24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function firstErrorField(errors: FieldErrors) {
  return Object.keys(errors)[0];
}

function InlineError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className={styles.error} id={id} role="alert">
      <span aria-hidden="true">!</span>
      {message}
    </p>
  );
}

function TimePicker({
  value,
  error,
  describedBy,
  onChange,
  onClose,
}: {
  value: string;
  error?: string;
  describedBy: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);
  const selectedPeriodRef = useRef<HTMLButtonElement>(null);
  const { hour, minute, period } = parseTime(value);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      selectedHourRef.current?.scrollIntoView({ block: "center" });
      selectedMinuteRef.current?.scrollIntoView({ block: "center" });
      selectedPeriodRef.current?.scrollIntoView({ block: "center" });
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      onClose();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      onClose();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hour, minute, onClose, open, period]);

  const updatePart = (part: TimePart, nextValue: number | TimePeriod) => {
    const nextHour = part === "hour" ? Number(nextValue) : hour;
    const nextMinute = part === "minute" ? Number(nextValue) : minute;
    const nextPeriod = part === "period" ? (nextValue as TimePeriod) : period;
    onChange(serializeTime(nextHour, nextMinute, nextPeriod));
  };

  const moveSelection = (
    part: TimePart,
    direction: "previous" | "next" | "first" | "last",
  ) => {
    if (part === "period") {
      const currentIndex = TIME_PERIODS.indexOf(period);
      const nextIndex = direction === "first"
        ? 0
        : direction === "last"
          ? TIME_PERIODS.length - 1
          : (currentIndex + (direction === "next" ? 1 : -1) + TIME_PERIODS.length) % TIME_PERIODS.length;
      updatePart(part, TIME_PERIODS[nextIndex]);
      return;
    }

    const options = part === "hour" ? TIME_HOURS : TIME_MINUTES;
    const currentValue = part === "hour" ? hour : minute;
    const currentIndex = options.indexOf(currentValue);
    const nextIndex = direction === "first"
      ? 0
      : direction === "last"
        ? options.length - 1
        : (currentIndex + (direction === "next" ? 1 : -1) + options.length) % options.length;
    updatePart(part, options[nextIndex]);
  };

  const handleListKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    part: TimePart,
  ) => {
    const directions: Partial<Record<string, "previous" | "next" | "first" | "last">> = {
      ArrowUp: "previous",
      ArrowLeft: "previous",
      ArrowDown: "next",
      ArrowRight: "next",
      Home: "first",
      End: "last",
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    moveSelection(part, direction);
  };

  const closePicker = () => {
    setOpen(false);
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className={styles.timePicker} ref={rootRef}>
      <button
        className={styles.timePickerTrigger}
        id="delivery-time"
        type="button"
        ref={triggerRef}
        data-open={open}
        data-invalid={Boolean(error)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "delivery-time-picker" : undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (open) {
            closePicker();
          } else {
            setOpen(true);
          }
        }}
      >
        <span>{formatTime(value)}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.25" />
          <path d="M12 7.4v5.1l3.35 1.95" />
        </svg>
      </button>

      {open && (
        <div
          className={styles.timePickerPanel}
          id="delivery-time-picker"
          role="dialog"
          aria-label="Choose delivery time"
        >
          <div className={styles.timePickerHeader}>
            <span>Delivery time</span>
            <strong aria-live="polite">{formatTime(value)}</strong>
          </div>

          <div className={styles.timePickerColumns}>
            <div className={styles.timePickerColumn}>
              <span id="delivery-hour-label">Hour</span>
              <div
                className={styles.timePickerOptions}
                role="listbox"
                tabIndex={0}
                aria-labelledby="delivery-hour-label"
                aria-activedescendant={`delivery-hour-${hour}`}
                onKeyDown={(event) => handleListKeyDown(event, "hour")}
              >
                {TIME_HOURS.map((option) => {
                  const selected = option === hour;
                  return (
                    <button
                      id={`delivery-hour-${option}`}
                      className={styles.timePickerOption}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      ref={selected ? selectedHourRef : undefined}
                      aria-selected={selected}
                      data-selected={selected}
                      key={option}
                      onClick={() => updatePart("hour", option)}
                    >
                      {String(option).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.timePickerColumn}>
              <span id="delivery-minute-label">Minute</span>
              <div
                className={styles.timePickerOptions}
                role="listbox"
                tabIndex={0}
                aria-labelledby="delivery-minute-label"
                aria-activedescendant={`delivery-minute-${minute}`}
                onKeyDown={(event) => handleListKeyDown(event, "minute")}
              >
                {TIME_MINUTES.map((option) => {
                  const selected = option === minute;
                  return (
                    <button
                      id={`delivery-minute-${option}`}
                      className={styles.timePickerOption}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      ref={selected ? selectedMinuteRef : undefined}
                      aria-selected={selected}
                      data-selected={selected}
                      key={option}
                      onClick={() => updatePart("minute", option)}
                    >
                      {String(option).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.timePickerColumn}>
              <span id="delivery-period-label">Period</span>
              <div
                className={styles.timePickerOptions}
                role="listbox"
                tabIndex={0}
                aria-labelledby="delivery-period-label"
                aria-activedescendant={`delivery-period-${period.toLowerCase()}`}
                onKeyDown={(event) => handleListKeyDown(event, "period")}
              >
                {TIME_PERIODS.map((option) => {
                  const selected = option === period;
                  return (
                    <button
                      id={`delivery-period-${option.toLowerCase()}`}
                      className={styles.timePickerOption}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      ref={selected ? selectedPeriodRef : undefined}
                      aria-selected={selected}
                      data-selected={selected}
                      key={option}
                      onClick={() => updatePart("period", option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={styles.timePickerFooter}>
            <span>Saved as you choose</span>
            <button type="button" onClick={closePicker}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimezonePicker({
  options,
  value,
  error,
  describedBy,
  onChange,
  onClose,
}: {
  options: string[];
  value: string;
  error?: string;
  describedBy: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);

  const filteredTimezones = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase().replaceAll(" ", "_");
    if (!normalizedQuery) {
      return [value, ...options.filter((timezone) => timezone !== value)];
    }
    return options.filter((timezone) =>
      timezone.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query, value]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      onClose();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      activeOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open, query]);

  const closePicker = () => {
    setOpen(false);
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectTimezone = (timezone: string) => {
    onChange(timezone);
    setQuery("");
    setActiveIndex(0);
    closePicker();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredTimezones.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        (current + direction + filteredTimezones.length) % filteredTimezones.length,
      );
      return;
    }

    if (event.key === "Enter" && filteredTimezones[activeIndex]) {
      event.preventDefault();
      selectTimezone(filteredTimezones[activeIndex]);
    }
  };

  return (
    <div className={styles.timezonePicker} ref={rootRef}>
      <button
        className={styles.timezonePickerTrigger}
        id="timezone"
        type="button"
        ref={triggerRef}
        data-open={open}
        data-invalid={Boolean(error)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "timezone-options" : undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (open) {
            closePicker();
          } else {
            setQuery("");
            setActiveIndex(0);
            setOpen(true);
          }
        }}
      >
        <span>{value}</span>
        <span className={styles.timezoneChevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.timezonePickerPanel}>
          <div className={styles.timezoneSearchWrap}>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6" />
              <path d="m15 15 4.5 4.5" />
            </svg>
            <input
              className={styles.timezoneSearch}
              ref={searchRef}
              type="search"
              role="combobox"
              value={query}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search by city or region"
              aria-label="Search timezones"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="timezone-options"
              aria-activedescendant={
                filteredTimezones[activeIndex]
                  ? `timezone-option-${activeIndex}`
                  : undefined
              }
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          <div className={styles.timezoneResultsMeta} aria-live="polite">
            <span>{filteredTimezones.length} timezones</span>
            <span>Type to filter</span>
          </div>

          <div
            className={styles.timezoneOptions}
            id="timezone-options"
            role="listbox"
            aria-label="Timezone options"
          >
            {filteredTimezones.length > 0 ? (
              filteredTimezones.map((timezone, index) => {
                const selected = timezone === value;
                const active = index === activeIndex;
                return (
                  <button
                    className={styles.timezoneOption}
                    id={`timezone-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    ref={active ? activeOptionRef : undefined}
                    aria-selected={selected}
                    data-active={active}
                    data-selected={selected}
                    key={timezone}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectTimezone(timezone)}
                  >
                    <span>{timezone}</span>
                    {selected && <small>Current</small>}
                  </button>
                );
              })
            ) : (
              <p className={styles.timezoneEmpty} role="status">
                No matching timezone found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TagInput({
  id,
  label,
  helper,
  placeholder,
  values,
  quieter = false,
  error,
  onChange,
  onError,
}: {
  id: string;
  label: string;
  helper: string;
  placeholder: string;
  values: string[];
  quieter?: boolean;
  error?: string;
  onChange: (values: string[]) => void;
  onError: (message?: string) => void;
}) {
  const [value, setValue] = useState("");
  const maximum = PRODUCT.limits.customTopics;

  const addValue = () => {
    const next = value.trim();
    if (!next) {
      onError("Enter a topic before adding it.");
      return;
    }
    if (next.length > 80) {
      onError("Keep each topic to 80 characters or fewer.");
      return;
    }
    if (values.some((item) => item.toLowerCase() === next.toLowerCase())) {
      onError("That topic is already added.");
      return;
    }
    if (values.length >= maximum) {
      onError(`You can add up to ${maximum} topics.`);
      return;
    }
    onChange([...values, next]);
    setValue("");
    onError(undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addValue();
    }
  };

  return (
    <div className={`${styles.tagField} ${quieter ? styles.quietField : ""}`}>
      <div className={styles.fieldHeading}>
        <div>
          <label htmlFor={id}>{label}</label>
          <span className={styles.optional}>Optional</span>
        </div>
        <span aria-live="polite">
          {values.length} of {maximum}
        </span>
      </div>
      <p className={styles.helper}>{helper}</p>
      {values.length > 0 && (
        <ul className={styles.tags} aria-label={`${label} added`}>
          {values.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => {
                  onChange(values.filter((valueToKeep) => valueToKeep !== item));
                  onError(undefined);
                }}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.tagComposer}>
        <input
          id={id}
          value={value}
          disabled={values.length >= maximum}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) onError(undefined);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            values.length >= maximum ? "Topic limit reached" : placeholder
          }
          aria-describedby={`${id}-helper ${error ? `${id}-error` : ""}`}
          aria-invalid={Boolean(error)}
          maxLength={81}
        />
        <button
          type="button"
          className={styles.addButton}
          onClick={addValue}
          disabled={values.length >= maximum}
        >
          Add
        </button>
      </div>
      <span className={styles.srOnly} id={`${id}-helper`}>
        {helper} Press Enter to add a topic. {values.length} of {maximum} added.
      </span>
      <InlineError id={`${id}-error`} message={error} />
    </div>
  );
}

export default function OnboardingFlow() {
  const countries = useMemo(() => getCountryOptions(), []);
  const timezones = useMemo(() => getTimezoneOptions(), []);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    createInitialDraft("Asia/Kolkata"),
  );
  const [countryQuery, setCountryQuery] = useState("🇮🇳 India");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [emailState, setEmailState] = useState<EmailCheckState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [complete, setComplete] = useState(false);
  const [completedEmail, setCompletedEmail] = useState("");
  const [resendState, setResendState] = useState<ResendState>("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const detectedTimezone = detectTimezone();
      const saved = parseStoredDraft(sessionStorage.getItem(ONBOARDING_DRAFT_KEY));
      if (saved) {
        const restoredDraft = {
          ...saved.draft,
          timezone:
            saved.draft.timezone === "Asia/Calcutta"
              ? "Asia/Kolkata"
              : saved.draft.timezone,
        };
        setDraft(restoredDraft);
        setStep(saved.step);
        const selected = countries.find(
          (country) => country.code === restoredDraft.countryCode,
        );
        if (selected) setCountryQuery(selected.label);
      } else {
        const initialDraft = createInitialDraft(detectedTimezone);
        const prefilledEmail = sessionStorage.getItem(
          "bulletin:onboarding-prefill-email",
        );
        if (prefilledEmail) {
          initialDraft.email = prefilledEmail;
          sessionStorage.removeItem("bulletin:onboarding-prefill-email");
        }
        setDraft(initialDraft);
      }
      setHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [countries]);

  useEffect(() => {
    if (!hydrated || complete) return;
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, serializeDraft(step, draft));
  }, [complete, draft, hydrated, step]);

  useEffect(() => {
    if (step !== 1 || emailState !== "idle") return;
    if (!draft.name.trim() && !draft.email.trim()) return;

    const timer = window.setTimeout(() => {
      const currentErrors = validateStep(1, draft);
      setErrors((previous) => {
        const next = { ...previous };
        const enteredValues = {
          name: draft.name.trim(),
          email: draft.email.trim(),
        };

        for (const field of ["name", "email"] as const) {
          if (enteredValues[field] && currentErrors[field]) {
            next[field] = currentErrors[field];
          }
          else delete next[field];
        }
        return next;
      });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [draft, emailState, step]);

  const content = STEP_CONTENT[step - 1];
  const progress = (step / 5) * 100;

  const updateDraft = <Key extends keyof OnboardingDraft>(
    field: Key,
    value: OnboardingDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmissionError(undefined);
    if (field === "email") setEmailState("idle");
  };

  const setFieldError = (field: keyof OnboardingDraft, message?: string) => {
    setErrors((current) => {
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  const validateField = (field: keyof OnboardingDraft) => {
    const message = validateStep(step, draft)[field];
    setFieldError(field, message);
  };

  const validateEnteredEmail = () => {
    if (!draft.email.trim()) {
      setFieldError("email");
      return;
    }
    validateField("email");
  };

  const focusFirstError = (nextErrors: FieldErrors) => {
    const field = firstErrorField(nextErrors);
    if (!field) return;
    window.requestAnimationFrame(() => {
      document.getElementById(FIELD_IDS[field] ?? field)?.focus();
    });
  };

  const moveToStep = (nextStep: number) => {
    setStep(nextStep);
    setErrors({});
    setEmailState("idle");
    setSubmissionError(undefined);
    window.requestAnimationFrame(() => {
      headingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const runEmailCheck = async () => {
    setEmailState("checking");
    const email = draft.email.trim().toLowerCase();
    setSubmissionError(undefined);
    try {
      const response = await fetch("/api/secure/email/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as {
        ok?: boolean;
        state?: "new" | "expired" | "verified" | "pending";
        emailSent?: boolean;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        setEmailState("idle");
        setSubmissionError(
          result.message ?? "We couldn’t check this address securely. Please try again.",
        );
        return;
      }
      if (result.state === "verified" && result.emailSent) {
        setEmailState("existing");
        return;
      }
      if (result.state === "pending" && result.emailSent) {
        setEmailState("pending");
        return;
      }
      setEmailState("idle");
      moveToStep(2);
    } catch {
      setEmailState("idle");
      setSubmissionError(
        "We couldn’t check this address securely. Please try again.",
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || emailState === "checking") return;

    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      focusFirstError(stepErrors);
      return;
    }

    if (step === 1) {
      await runEmailCheck();
      return;
    }

    if (step < 5) {
      moveToStep(step + 1);
      return;
    }

    const completeDraft = validateCompleteDraft(draft);
    if (!completeDraft.success) {
      setErrors(completeDraft.errors);
      focusFirstError(completeDraft.errors);
      return;
    }

    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const response = await fetch("/api/secure/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeDraft.data),
      });
      const result = await response.json() as {
        ok?: boolean;
        emailSent?: boolean;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.emailSent) {
        setSubmissionError(
          result.message ?? "We couldn’t send the verification email. Your choices are still here—please try again.",
        );
        return;
      }

      setCompletedEmail(completeDraft.data.email);
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      setComplete(true);
      setResendState("idle");
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    } catch {
      setSubmissionError(
        "We couldn’t send the verification email. Your choices are still here—please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (category: NewsCategory) => {
    const selected = draft.categories.includes(category);
    if (!selected && draft.categories.length >= PRODUCT.limits.categories.max) {
      setFieldError(
        "categories",
        `You can select up to ${PRODUCT.limits.categories.max} categories.`,
      );
      return;
    }
    const categories = selected
      ? draft.categories.filter((item) => item !== category)
      : [...draft.categories, category];
    const range = storyCountRange(categories.length);
    updateDraft("categories", categories);
    updateDraft("storyCount", Math.max(range.min, Math.min(range.max, draft.storyCount)));
  };

  const selectedCountry = countries.find(
    (country) => country.code === draft.countryCode,
  );

  const deliverySummary = useMemo(() => {
    const time = formatTime(draft.deliveryTime);
    if (draft.frequency === "weekly") {
      const day = draft.weeklyDay
        ? `every ${WEEKDAY_LABELS[draft.weeklyDay]}`
        : "weekly on your chosen day";
      return `Your Bulletin will arrive ${day} at ${time} in ${draft.timezone}.`;
    }
    const cadence =
      draft.frequency === "daily"
        ? "every day"
        : draft.frequency === "weekdays"
          ? "every weekday"
          : "every weekend day";
    return `Your Bulletin will arrive ${cadence} at ${time} in ${draft.timezone}.`;
  }, [draft.deliveryTime, draft.frequency, draft.timezone, draft.weeklyDay]);

  const resend = async () => {
    if (resendState === "sending") return;
    setResendState("sending");
    try {
      const response = await fetch("/api/secure/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: completedEmail }),
      });
      const result = await response.json() as { ok?: boolean; emailSent?: boolean };
      setResendState(response.ok && result.ok && result.emailSent ? "success" : "error");
    } catch {
      setResendState("error");
    }
  };

  const startAgain = () => {
    const timezone = detectTimezone();
    const nextDraft = createInitialDraft(timezone);
    setDraft(nextDraft);
    setCountryQuery("🇮🇳 India");
    setStep(1);
    setErrors({});
    setEmailState("idle");
    setComplete(false);
    setCompletedEmail("");
    setResendState("idle");
    setSubmissionError(undefined);
    sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  };

  return (
    <div className={styles.pageShell}>
      <a className={styles.skipLink} href="#onboarding-main">
        Skip to onboarding
      </a>
      <header className={styles.header}>
        <Link className={styles.masthead} href="/" aria-label={`${PRODUCT.name} home`}>
          {PRODUCT.name}
        </Link>
        <Link className={styles.homeLink} href="/">
          <span aria-hidden="true">←</span> Back to home
        </Link>
      </header>

      {!complete && (
        <div className={styles.progressRegion}>
          <div className={styles.progressMeta}>
            <span>Step {step} of 5</span>
            <span>{content.eyebrow}</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={step}
            aria-label={`Onboarding progress: step ${step} of 5`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <main className={styles.main} id="onboarding-main">
        {complete ? (
          <section className={styles.success} aria-labelledby="success-heading">
            <div className={styles.successMark} aria-hidden="true">
              <span />
            </div>
            <p className={styles.eyebrow}>One last step</p>
            <h1 id="success-heading">Check your inbox.</h1>
            <p className={styles.successLede}>
              A secure email was sent to <strong>{completedEmail}</strong>. Open the
              newest link, then use the deliberate confirmation button to activate
              delivery.
            </p>

            <div className={styles.successActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resend}
                disabled={resendState === "sending"}
              >
                {resendState === "sending" ? (
                  <><span className={styles.spinner} aria-hidden="true" /> Preparing…</>
                ) : (
                  "Resend email"
                )}
              </button>
              <button type="button" className={styles.textButton} onClick={startAgain}>
                Use a different email
              </button>
            </div>

            <div className={styles.resendStatus} aria-live="polite">
              {resendState === "success" && (
                <p>A fresh email was sent. Every older active verification link is now invalid.</p>
              )}
              {resendState === "error" && (
                <p className={styles.errorText}>
                  The preview resend could not be prepared. Try again in a moment.
                </p>
              )}
            </div>
            <p className={styles.expiryNote}>Verification links expire after 24 hours.</p>
          </section>
        ) : (
          <div className={styles.editorialGrid}>
            <aside className={styles.aside} aria-hidden="true">
              <span className={styles.issueNumber}>0{step}</span>
              <div>
                <p>{content.note}</p>
                <span>Bulletin · Private beta</span>
              </div>
            </aside>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.stepIntro}>
                <p className={styles.eyebrow}>{content.eyebrow}</p>
                <h1 ref={headingRef} tabIndex={-1}>
                  {content.heading}
                </h1>
                <p>{content.description}</p>
              </div>

              <div key={step} className={styles.stepBody}>
                {step === 1 && (
                  <>
                    <div className={styles.field}>
                      <label htmlFor="name">Your name</label>
                      <input
                        id="name"
                        name="name"
                        autoComplete="name"
                        value={draft.name}
                        onChange={(event) => updateDraft("name", event.target.value)}
                        onBlur={() => validateField("name")}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "name-error" : undefined}
                        maxLength={101}
                        placeholder="How should we address you?"
                      />
                      <InlineError id="name-error" message={errors.name} />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="email">Email address</label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={draft.email}
                        onChange={(event) => updateDraft("email", event.target.value)}
                        onBlur={validateEnteredEmail}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                        maxLength={255}
                        placeholder="you@example.com"
                      />
                      <InlineError id="email-error" message={errors.email} />
                    </div>

                    {emailState === "checking" && (
                      <div className={styles.checkingState} role="status">
                        <span className={styles.spinner} aria-hidden="true" />
                        <div>
                          <strong>Checking your email address</strong>
                          <p>Making sure your saved choices stay protected.</p>
                        </div>
                      </div>
                    )}

                    {(emailState === "existing" || emailState === "pending") && (
                      <div className={styles.accountState} role="status">
                        <span className={styles.accountRule} aria-hidden="true" />
                        <div>
                          <strong>
                            {emailState === "existing"
                              ? "An existing Bulletin was found for this email."
                              : "Your choices are already saved."}
                          </strong>
                          <p>
                            {emailState === "existing"
                              ? "Your private preferences were not shown or changed. A fresh secure management email has been sent."
                              : "The saved pending choices were not overwritten. Older verification links were invalidated and a fresh email was sent."}
                          </p>
                          <small>Use only the newest email. Links are short-lived.</small>
                        </div>
                      </div>
                    )}

                    {submissionError && (
                      <div className={styles.submissionError} role="alert">
                        <strong>Nothing private was shown or changed.</strong>
                        <p>{submissionError}</p>
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className={styles.twoColumnFields}>
                      <div className={styles.field}>
                        <label htmlFor="country">Country</label>
                        <input
                          id="country"
                          list="country-options"
                          autoComplete="country-name"
                          value={countryQuery}
                          onChange={(event) => {
                            const query = event.target.value;
                            setCountryQuery(query);
                            const match = countries.find(
                              (country) =>
                                country.label.toLowerCase() === query.toLowerCase() ||
                                country.name.toLowerCase() === query.toLowerCase(),
                            );
                            const nextCode = match?.code ?? "";
                            if (nextCode !== draft.countryCode) {
                              updateDraft("countryCode", nextCode);
                              updateDraft("stateRegion", "");
                            }
                          }}
                          onBlur={() => validateField("countryCode")}
                          aria-invalid={Boolean(errors.countryCode)}
                          aria-describedby={
                            errors.countryCode ? "country-error" : undefined
                          }
                          placeholder="Search countries"
                        />
                        <datalist id="country-options">
                          {countries.map((country) => (
                            <option value={country.label} key={country.code} />
                          ))}
                        </datalist>
                        <InlineError
                          id="country-error"
                          message={errors.countryCode}
                        />
                      </div>

                      <div className={styles.field}>
                        <label htmlFor="state-region">State or region</label>
                        <input
                          id="state-region"
                          list={draft.countryCode === "IN" ? "india-regions" : undefined}
                          autoComplete="address-level1"
                          value={draft.stateRegion}
                          onChange={(event) =>
                            updateDraft("stateRegion", event.target.value)
                          }
                          onBlur={() => {
                            const canonicalRegion = getCanonicalIndianRegion(
                              draft.stateRegion,
                            );
                            if (canonicalRegion) {
                              updateDraft("stateRegion", canonicalRegion);
                            }
                            validateField("stateRegion");
                          }}
                          aria-invalid={Boolean(errors.stateRegion)}
                          aria-describedby={
                            errors.stateRegion ? "state-region-error" : undefined
                          }
                          placeholder={
                            draft.countryCode === "IN"
                              ? "Search states and union territories"
                              : "Enter your state or region"
                          }
                          maxLength={101}
                        />
                        {draft.countryCode === "IN" && (
                          <datalist id="india-regions">
                            {INDIAN_REGIONS.map((region) => (
                              <option value={region} key={region} />
                            ))}
                          </datalist>
                        )}
                        <InlineError
                          id="state-region-error"
                          message={errors.stateRegion}
                        />
                      </div>
                    </div>

                    <div className={`${styles.field} ${styles.cityField}`}>
                      <div className={styles.labelRow}>
                        <label htmlFor="city">City</label>
                        <span className={styles.optional}>Optional</span>
                      </div>
                      <input
                        id="city"
                        autoComplete="address-level2"
                        value={draft.city}
                        onChange={(event) => updateDraft("city", event.target.value)}
                        onBlur={() => validateField("city")}
                        aria-invalid={Boolean(errors.city)}
                        aria-describedby={errors.city ? "city-error" : undefined}
                        maxLength={101}
                        placeholder="Add a city for more local relevance"
                      />
                      <InlineError id="city-error" message={errors.city} />
                    </div>

                    <fieldset className={styles.choiceFieldset}>
                      <legend>Briefing language</legend>
                      <div className={styles.languageGrid}>
                        {SUPPORTED_LANGUAGES.map((language) => (
                          <label
                            className={styles.choiceCard}
                            data-selected={draft.language === language}
                            key={language}
                          >
                            <input
                              id={`language-${LANGUAGE_LABELS[language].toLowerCase()}`}
                              type="radio"
                              name="language"
                              value={language}
                              checked={draft.language === language}
                              onChange={() => updateDraft("language", language)}
                            />
                            <span>{LANGUAGE_LABELS[language]}</span>
                            <small>
                              {language === "en"
                                ? "English"
                                : language === "hi"
                                  ? "हिन्दी"
                                  : "മലയാളം"}
                            </small>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className={styles.field}>
                      <label htmlFor="timezone">Timezone</label>
                      <TimezonePicker
                        options={timezones}
                        value={draft.timezone}
                        error={errors.timezone}
                        describedBy={`timezone-helper ${errors.timezone ? "timezone-error" : ""}`}
                        onChange={(timezone) => updateDraft("timezone", timezone)}
                        onClose={() => validateField("timezone")}
                      />
                      <p className={styles.helper} id="timezone-helper">
                        Delivery follows this timezone, including seasonal clock changes.
                      </p>
                      <InlineError id="timezone-error" message={errors.timezone} />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <fieldset className={styles.categoriesFieldset}>
                      <div className={styles.fieldHeading}>
                        <legend>News categories</legend>
                        <span aria-live="polite">
                          {draft.categories.length} of {PRODUCT.limits.categories.max} selected
                        </span>
                      </div>
                      <div className={styles.categoryCloud}>
                        {NEWS_CATEGORIES.map((category) => {
                          const selected = draft.categories.includes(category);
                          return (
                            <button
                              type="button"
                              className={styles.categoryPill}
                              data-selected={selected}
                              data-tone={CATEGORY_TONE[category]}
                              aria-pressed={selected}
                              id={`category-${category}`}
                              key={category}
                              onClick={() => toggleCategory(category)}
                            >
                              {NEWS_CATEGORY_LABELS[category]}
                              <span className={styles.srOnly}>
                                {selected ? ", selected" : ", not selected"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <InlineError id="categories-error" message={errors.categories} />
                    </fieldset>

                    <TagInput
                      id="custom-topic-input"
                      label="Custom topics"
                      helper="Add specific subjects you’d especially like to follow."
                      placeholder="e.g. space exploration"
                      values={draft.customTopics}
                      error={errors.customTopics}
                      onChange={(values) => updateDraft("customTopics", values)}
                      onError={(message) => setFieldError("customTopics", message)}
                    />

                    <TagInput
                      id="excluded-topic-input"
                      label="Excluded topics"
                      helper="Bulletin will avoid stories where an excluded topic is the main subject."
                      placeholder="celebrity gossip"
                      values={draft.excludedTopics}
                      quieter
                      error={errors.excludedTopics}
                      onChange={(values) => updateDraft("excludedTopics", values)}
                      onError={(message) => setFieldError("excludedTopics", message)}
                    />
                  </>
                )}

                {step === 4 && (
                  <>
                    <div className={styles.storyControl}>
                      <div>
                        <label htmlFor="story-count">Stories in each briefing</label>
                        <p>{draft.storyCount} stories total — three or four from every selected category.</p>
                      </div>
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          aria-label="Decrease story count"
                          onClick={() =>
                            updateDraft(
                              "storyCount",
                              Math.max(storyCountRange(draft.categories.length).min, draft.storyCount - 1),
                            )
                          }
                          disabled={draft.storyCount <= storyCountRange(draft.categories.length).min}
                        >
                          −
                        </button>
                        <input
                          id="story-count"
                          type="number"
                          inputMode="numeric"
                          min={storyCountRange(draft.categories.length).min}
                          max={storyCountRange(draft.categories.length).max}
                          value={draft.storyCount}
                          onChange={(event) =>
                            updateDraft("storyCount", Number(event.target.value))
                          }
                          onBlur={() => validateField("storyCount")}
                          aria-invalid={Boolean(errors.storyCount)}
                          aria-describedby={`story-helper ${errors.storyCount ? "story-count-error" : ""}`}
                        />
                        <button
                          type="button"
                          aria-label="Increase story count"
                          onClick={() =>
                            updateDraft(
                              "storyCount",
                              Math.min(storyCountRange(draft.categories.length).max, draft.storyCount + 1),
                            )
                          }
                          disabled={draft.storyCount >= storyCountRange(draft.categories.length).max}
                        >
                          +
                        </button>
                      </div>
                      <p className={styles.srOnly} id="story-helper">
                        Choose between three and four stories for every selected category.
                      </p>
                      <InlineError id="story-count-error" message={errors.storyCount} />
                    </div>
                    <p className={styles.storyNote}>
                      If there aren’t enough meaningful updates, Bulletin will send fewer—not filler.
                    </p>

                    <fieldset className={styles.choiceFieldset}>
                      <legend>Frequency</legend>
                      <div className={styles.frequencyGrid}>
                        {DELIVERY_FREQUENCIES.map((frequency) => (
                          <label
                            className={styles.frequencyCard}
                            data-selected={draft.frequency === frequency}
                            key={frequency}
                          >
                            <input
                              id={`frequency-${frequency}`}
                              type="radio"
                              name="frequency"
                              checked={draft.frequency === frequency}
                              onChange={() => {
                                updateDraft("frequency", frequency);
                                if (frequency !== "weekly") {
                                  updateDraft("weeklyDay", undefined);
                                  setFieldError("weeklyDay", undefined);
                                }
                              }}
                            />
                            <span>{DELIVERY_FREQUENCY_LABELS[frequency]}</span>
                            <small>{FREQUENCY_DESCRIPTIONS[frequency]}</small>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {draft.frequency === "weekly" && (
                      <div className={`${styles.field} ${styles.revealField}`}>
                        <label htmlFor="weekly-day">Delivery day</label>
                        <select
                          id="weekly-day"
                          value={draft.weeklyDay ?? ""}
                          onChange={(event) =>
                            updateDraft("weeklyDay", event.target.value as Weekday)
                          }
                          onBlur={() => validateField("weeklyDay")}
                          aria-invalid={Boolean(errors.weeklyDay)}
                          aria-describedby={errors.weeklyDay ? "weekly-day-error" : undefined}
                        >
                          <option value="">Choose a day</option>
                          {WEEKDAYS.map((day) => (
                            <option value={day} key={day}>
                              {WEEKDAY_LABELS[day]}
                            </option>
                          ))}
                        </select>
                        <InlineError id="weekly-day-error" message={errors.weeklyDay} />
                      </div>
                    )}

                    <div className={`${styles.field} ${styles.timeField}`}>
                      <label htmlFor="delivery-time">Delivery time</label>
                      <TimePicker
                        value={draft.deliveryTime}
                        error={errors.deliveryTime}
                        describedBy={`delivery-summary ${errors.deliveryTime ? "delivery-time-error" : ""}`}
                        onChange={(value) => updateDraft("deliveryTime", value)}
                        onClose={() => validateField("deliveryTime")}
                      />
                      <InlineError
                        id="delivery-time-error"
                        message={errors.deliveryTime}
                      />
                    </div>

                    <div className={styles.deliverySummary} id="delivery-summary" aria-live="polite">
                      <span aria-hidden="true" />
                      <p>{deliverySummary}</p>
                    </div>
                  </>
                )}

                {step === 5 && (
                  <>
                    <div className={styles.review}>
                      <section>
                        <div className={styles.reviewHeading}>
                          <h2>About you</h2>
                          <button type="button" aria-label="Edit about you" onClick={() => moveToStep(1)}>Edit</button>
                        </div>
                        <dl>
                          <div><dt>Name</dt><dd>{draft.name}</dd></div>
                          <div><dt>Email</dt><dd>{draft.email}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <div className={styles.reviewHeading}>
                          <h2>Location and language</h2>
                          <button type="button" aria-label="Edit location and language" onClick={() => moveToStep(2)}>Edit</button>
                        </div>
                        <dl>
                          <div>
                            <dt>Location</dt>
                            <dd>
                              {[draft.city, draft.stateRegion, selectedCountry?.name]
                                .filter(Boolean)
                                .join(", ")}
                            </dd>
                          </div>
                          <div><dt>Language</dt><dd>{LANGUAGE_LABELS[draft.language]}</dd></div>
                          <div><dt>Timezone</dt><dd>{draft.timezone}</dd></div>
                        </dl>
                      </section>

                      <section>
                        <div className={styles.reviewHeading}>
                          <h2>Interests</h2>
                          <button type="button" aria-label="Edit interests" onClick={() => moveToStep(3)}>Edit</button>
                        </div>
                        <div className={styles.reviewPills}>
                          {draft.categories.map((category) => (
                            <span key={category}>{NEWS_CATEGORY_LABELS[category]}</span>
                          ))}
                        </div>
                        {draft.customTopics.length > 0 && (
                          <p className={styles.reviewTopics}>
                            <strong>Especially:</strong> {draft.customTopics.join(" · ")}
                          </p>
                        )}
                        {draft.excludedTopics.length > 0 && (
                          <p className={styles.reviewExclusions}>
                            <strong>Excluded:</strong> {draft.excludedTopics.join(" · ")}
                          </p>
                        )}
                      </section>

                      <section>
                        <div className={styles.reviewHeading}>
                          <h2>Delivery</h2>
                          <button type="button" aria-label="Edit delivery" onClick={() => moveToStep(4)}>Edit</button>
                        </div>
                        <dl>
                          <div><dt>Stories</dt><dd>Up to {draft.storyCount}</dd></div>
                          <div>
                            <dt>Frequency</dt>
                            <dd>
                              {DELIVERY_FREQUENCY_LABELS[draft.frequency]}
                              {draft.frequency === "weekly" && draft.weeklyDay
                                ? ` · ${WEEKDAY_LABELS[draft.weeklyDay]}`
                                : ""}
                            </dd>
                          </div>
                          <div><dt>Time</dt><dd>{formatTime(draft.deliveryTime)}</dd></div>
                        </dl>
                      </section>

                      <section className={styles.appearanceReview}>
                        <div className={styles.reviewHeading}>
                          <h2>Appearance</h2>
                        </div>
                        <div>
                          <span className={styles.themeSwatch} aria-hidden="true" />
                          <p><strong>Light Editorial</strong><small>Default</small></p>
                        </div>
                      </section>
                    </div>

                    <div className={styles.consentField} data-error={Boolean(errors.consent)}>
                      <label htmlFor="consent">
                        <input
                          id="consent"
                          type="checkbox"
                          checked={draft.consent}
                          onChange={(event) => updateDraft("consent", event.target.checked)}
                          aria-invalid={Boolean(errors.consent)}
                          aria-describedby={`consent-copy ${errors.consent ? "consent-error" : ""}`}
                        />
                        <span className={styles.customCheckbox} aria-hidden="true" />
                        <span id="consent-copy">
                          I agree to receive my Bulletin by email. I understand that I can
                          unsubscribe and delete my information at any time.
                        </span>
                      </label>
                      <p className={styles.legalCopy}>
                        By continuing, you acknowledge Bulletin’s <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
                      </p>
                      <InlineError id="consent-error" message={errors.consent} />
                    </div>

                    {submissionError && (
                      <div className={styles.submissionError} role="alert">
                        <strong>We kept every choice.</strong>
                        <p>{submissionError}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className={styles.actions} data-step={step}>
                {step > 1 && (
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => moveToStep(step - 1)}
                  >
                    <span aria-hidden="true">←</span> Back
                  </button>
                )}
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={submitting || emailState === "checking"}
                >
                  {submitting || emailState === "checking" ? (
                    <><span className={styles.spinnerLight} aria-hidden="true" /> {submitting ? "Preparing…" : "Checking…"}</>
                  ) : step === 5 ? (
                    "Generate my briefing"
                  ) : (
                    <>Continue <span aria-hidden="true">→</span></>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>{PRODUCT.promise}</p>
        <p>Private beta · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
