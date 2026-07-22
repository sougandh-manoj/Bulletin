"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BRIEFING_THEME_LABELS,
  BRIEFING_THEMES,
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
  type BriefingTheme,
  type DeliveryFrequency,
  type NewsCategory,
  type SupportedLanguage,
  type Weekday,
} from "@/config/product";
import { formatDeliveryDateTime } from "@/lib/presentation/date-time";

import {
  CATEGORY_TONE,
  FREQUENCY_DESCRIPTIONS,
  getCountryOptions,
} from "../onboarding/onboarding-data";
import styles from "../secure-access.module.css";
import { ThemePreview, themeCardClassName } from "../theme-preview";

type ManageState = {
  name: string;
  status: "active" | "paused";
  preferenceVersion: number;
  countryCode: string;
  stateRegion: string;
  city: string;
  language: SupportedLanguage;
  categories: NewsCategory[];
  customTopics: string[];
  excludedTopics: string[];
  storyCount: number;
  theme: BriefingTheme;
  frequency: DeliveryFrequency;
  weeklyDay?: Weekday;
  deliveryTime: string;
  timezone: string;
  nextDeliveryAt: string | null;
};

type TimePeriod = "AM" | "PM";
type TimePart = "hour" | "minute" | "period";

const TIME_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PERIODS: TimePeriod[] = ["AM", "PM"];

function formatTime(value: string) {
  const [hour = "8", minute = "00"] = value.split(":");
  const numericHour = Number(hour);
  const suffix = numericHour >= 12 ? "PM" : "AM";
  return `${numericHour % 12 || 12}:${minute} ${suffix}`;
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

function ManageTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hour, minute, open, period]);

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

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>, part: TimePart) => {
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
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const renderOptions = (
    part: TimePart,
    options: readonly (number | TimePeriod)[],
    selectedValue: number | TimePeriod,
  ) => (
    <div
      className={styles.manageTimeOptions}
      role="listbox"
      tabIndex={0}
      aria-label={`Delivery ${part}`}
      aria-activedescendant={`manage-time-${part}-${String(selectedValue).toLowerCase()}`}
      onKeyDown={(event) => handleListKeyDown(event, part)}
    >
      {options.map((option) => {
        const selected = option === selectedValue;
        const ref = selected
          ? part === "hour"
            ? selectedHourRef
            : part === "minute"
              ? selectedMinuteRef
              : selectedPeriodRef
          : undefined;
        return (
          <button
            id={`manage-time-${part}-${String(option).toLowerCase()}`}
            className={styles.manageTimeOption}
            type="button"
            role="option"
            tabIndex={-1}
            ref={ref}
            aria-selected={selected}
            data-selected={selected}
            key={option}
            onClick={() => updatePart(part, option)}
          >
            {typeof option === "number" ? String(option).padStart(2, "0") : option}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.manageTimePicker} ref={rootRef}>
      <button
        className={styles.manageTimeTrigger}
        id="manage-time"
        type="button"
        ref={triggerRef}
        data-open={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "manage-time-picker" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatTime(value)}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.25" />
          <path d="M12 7.4v5.1l3.35 1.95" />
        </svg>
      </button>

      {open && (
        <div
          className={styles.manageTimePanel}
          id="manage-time-picker"
          role="dialog"
          aria-label="Choose delivery time"
        >
          <div className={styles.manageTimeHeader}>
            <span>Delivery time</span>
            <strong aria-live="polite">{formatTime(value)}</strong>
          </div>
          <div className={styles.manageTimeColumns}>
            <div><span>Hour</span>{renderOptions("hour", TIME_HOURS, hour)}</div>
            <div><span>Minute</span>{renderOptions("minute", TIME_MINUTES, minute)}</div>
            <div><span>Period</span>{renderOptions("period", TIME_PERIODS, period)}</div>
          </div>
          <div className={styles.manageTimeFooter}>
            <span>Choose any exact time</span>
            <button type="button" onClick={closePicker}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManageTagInput({
  id,
  label,
  helper,
  placeholder,
  values,
  quieter = false,
  onChange,
}: {
  id: string;
  label: string;
  helper: string;
  placeholder: string;
  values: string[];
  quieter?: boolean;
  onChange: (values: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const maximum = PRODUCT.limits.customTopics;

  const addValue = () => {
    const next = value.trim();
    if (!next) return setError("Enter a topic before adding it.");
    if (next.length > 80) return setError("Keep each topic to 80 characters or fewer.");
    if (values.some((item) => item.toLowerCase() === next.toLowerCase())) {
      return setError("That topic is already added.");
    }
    if (values.length >= maximum) return setError(`You can add up to ${maximum} topics.`);
    onChange([...values, next]);
    setValue("");
    setError("");
  };

  return (
    <div className={`${styles.manageTagField} ${quieter ? styles.manageQuietField : ""}`}>
      <div className={styles.manageFieldHeading}>
        <div>
          <label htmlFor={id}>{label}</label>
          <span className={styles.manageOptional}>Optional</span>
        </div>
        <span aria-live="polite">{values.length} of {maximum}</span>
      </div>
      <p className={styles.manageHelper}>{helper}</p>
      {values.length > 0 && (
        <ul className={styles.manageTags} aria-label={`${label} added`}>
          {values.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => {
                  onChange(values.filter((valueToKeep) => valueToKeep !== item));
                  setError("");
                }}
              >×</button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.manageTagComposer}>
        <input
          id={id}
          value={value}
          disabled={values.length >= maximum}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={values.length >= maximum ? "Topic limit reached" : placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          maxLength={81}
        />
        <button
          type="button"
          className={styles.manageAddButton}
          onClick={addValue}
          disabled={values.length >= maximum}
        >Add</button>
      </div>
      {error && <p className={styles.manageFieldError} id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

export default function ManageBriefing({
  csrfToken,
  initial,
}: {
  csrfToken: string;
  initial: ManageState;
}) {
  const countries = useMemo(() => getCountryOptions(), []);
  const initialCountry = countries.find((country) => country.code === initial.countryCode);
  const [draft, setDraft] = useState(initial);
  const [countryQuery, setCountryQuery] = useState(initialCountry?.label ?? initial.countryCode);
  const [version, setVersion] = useState(initial.preferenceVersion);
  const [status, setStatus] = useState(initial.status);
  const [nextDeliveryAt, setNextDeliveryAt] = useState(initial.nextDeliveryAt);
  const [saving, setSaving] = useState(false);
  const [controlPending, setControlPending] = useState(false);
  const [themePending, setThemePending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const formattedNext = useMemo(() => {
    if (status === "paused") return "Paused — no delivery is scheduled";
    if (!nextDeliveryAt) return "The next normal slot is being prepared";
    return formatDeliveryDateTime(nextDeliveryAt, draft.timezone);
  }, [draft.timezone, nextDeliveryAt, status]);

  const update = <K extends keyof ManageState>(field: K, value: ManageState[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice("");
    setError("");
  };

  const toggleCategory = (category: NewsCategory) => {
    const selected = draft.categories.includes(category);
    if (!selected && draft.categories.length >= 8) {
      setError("Choose no more than eight categories.");
      return;
    }
    const categories = selected
      ? draft.categories.filter((item) => item !== category)
      : [...draft.categories, category];
    update("categories", categories);
    update("storyCount", storyCountRange(categories.length).min);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/secure/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrfToken,
          expectedVersion: version,
          preferences: {
            name: draft.name,
            countryCode: draft.countryCode,
            stateRegion: draft.stateRegion,
            city: draft.city,
            language: draft.language,
            categories: draft.categories,
            customTopics: draft.customTopics,
            excludedTopics: draft.excludedTopics,
            storyCount: draft.storyCount,
            theme: draft.theme,
            frequency: draft.frequency,
            weeklyDay: draft.frequency === "weekly" ? draft.weeklyDay : undefined,
            deliveryTime: draft.deliveryTime,
            timezone: draft.timezone,
          },
        }),
      });
      const result = await response.json() as {
        ok?: boolean;
        version?: number;
        nextDeliveryAt?: string | null;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.version) {
        setError(`${result.message ?? "Changes could not be saved."} No previously saved preference was changed.`);
        return;
      }
      setVersion(result.version);
      setNextDeliveryAt(result.nextDeliveryAt ?? null);
      setNotice("Changes saved.");
    } catch {
      setError("We couldn’t save your changes. Your previous settings are still in place.");
    } finally {
      setSaving(false);
    }
  };

  const chooseTheme = async (theme: BriefingTheme) => {
    if (themePending || theme === draft.theme) return;
    const previous = draft.theme;
    update("theme", theme);
    setThemePending(true);
    try {
      const response = await fetch("/api/secure/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, theme, expectedVersion: version }),
      });
      const result = await response.json() as { ok?: boolean; version?: number; message?: string };
      if (!response.ok || !result.ok || !result.version) {
        update("theme", previous);
        setError(result.message ?? "Theme was not changed.");
        return;
      }
      setVersion(result.version);
    } catch {
      update("theme", previous);
      setError("Theme was not changed. The previous theme remains active.");
    } finally {
      setThemePending(false);
    }
  };

  const changeDeliveryState = async () => {
    if (controlPending) return;
    const action = status === "active" ? "pause" : "resume";
    setControlPending(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/secure/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken, action }),
      });
      const result = await response.json() as {
        ok?: boolean;
        status?: "active" | "paused";
        nextDeliveryAt?: string | null;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.status) {
        setError(result.message ?? "Delivery state was not changed.");
        return;
      }
      setStatus(result.status);
      setNextDeliveryAt(result.nextDeliveryAt ?? null);
      setNotice(
        result.status === "paused"
          ? "Your briefing is paused."
          : "Your briefing is active again.",
      );
    } catch {
      setError("Delivery state was not changed. Try again.");
    } finally {
      setControlPending(false);
    }
  };

  return (
    <form className={styles.manageLayout} onSubmit={save} noValidate>
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="profile-heading">
          <div className={styles.manageSectionHeading}>
            <p>01</p>
            <div><h2 id="profile-heading">About you</h2><span>Your name, place, and language.</span></div>
          </div>
          <div className={styles.manageTwoColumns}>
            <div className={styles.manageField}>
              <label htmlFor="manage-name">Name</label>
              <input id="manage-name" autoComplete="name" value={draft.name} maxLength={100} required onChange={(event) => update("name", event.target.value)} />
            </div>
            <div className={styles.manageField}>
              <label htmlFor="manage-country">Country</label>
              <input
                id="manage-country"
                list="manage-country-options"
                autoComplete="country-name"
                value={countryQuery}
                placeholder="Search countries"
                onChange={(event) => {
                  const query = event.target.value;
                  setCountryQuery(query);
                  const match = countries.find(
                    (country) => country.label.toLowerCase() === query.toLowerCase()
                      || country.name.toLowerCase() === query.toLowerCase(),
                  );
                  const nextCode = match?.code ?? "";
                  if (nextCode !== draft.countryCode) {
                    update("countryCode", nextCode);
                    update("stateRegion", "");
                  }
                }}
              />
              <datalist id="manage-country-options">
                {countries.map((country) => <option value={country.label} key={country.code} />)}
              </datalist>
            </div>
          </div>
          <div className={styles.manageTwoColumns}>
            <div className={styles.manageField}>
              <label htmlFor="manage-region">State or region</label>
              <input
                id="manage-region"
                list={draft.countryCode === "IN" ? "manage-india-regions" : undefined}
                autoComplete="address-level1"
                value={draft.stateRegion}
                maxLength={100}
                onChange={(event) => update("stateRegion", event.target.value)}
                onBlur={() => {
                  const canonical = getCanonicalIndianRegion(draft.stateRegion);
                  if (canonical) update("stateRegion", canonical);
                }}
              />
              {draft.countryCode === "IN" && (
                <datalist id="manage-india-regions">
                  {INDIAN_REGIONS.map((region) => <option value={region} key={region} />)}
                </datalist>
              )}
            </div>
            <div className={styles.manageField}>
              <div className={styles.manageLabelRow}>
                <label htmlFor="manage-city">City</label>
                <span className={styles.manageOptional}>Optional</span>
              </div>
              <input id="manage-city" autoComplete="address-level2" value={draft.city} maxLength={100} onChange={(event) => update("city", event.target.value)} />
            </div>
          </div>
          <fieldset className={styles.manageChoiceFieldset}>
            <legend>Briefing language</legend>
            <div className={styles.manageLanguageGrid}>
              {SUPPORTED_LANGUAGES.map((language) => (
                <label className={styles.manageChoiceCard} data-selected={draft.language === language} key={language}>
                  <input
                    id={`manage-language-${language}`}
                    type="radio"
                    name="manage-language"
                    value={language}
                    checked={draft.language === language}
                    onChange={() => update("language", language)}
                  />
                  <span>{LANGUAGE_LABELS[language]}</span>
                  <small>{language === "en" ? "English" : language === "hi" ? "हिन्दी" : "മലയാളം"}</small>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className={styles.section} aria-labelledby="interests-heading">
          <div className={styles.manageSectionHeading}>
            <p>02</p>
            <div><h2 id="interests-heading">Interests</h2><span>Choose what deserves your attention.</span></div>
          </div>
          <fieldset className={styles.manageCategoriesFieldset}>
            <div className={styles.manageFieldHeading}>
              <legend>News categories</legend>
              <span aria-live="polite">{draft.categories.length} of 8 selected</span>
            </div>
            <div className={styles.manageCategoryCloud}>
              {NEWS_CATEGORIES.map((category) => {
                const selected = draft.categories.includes(category);
                return (
                  <button
                    type="button"
                    className={styles.manageCategoryPill}
                    data-selected={selected}
                    data-tone={CATEGORY_TONE[category]}
                    aria-pressed={selected}
                    key={category}
                    onClick={() => toggleCategory(category)}
                  >
                    {NEWS_CATEGORY_LABELS[category]}
                    <span className={styles.srOnly}>{selected ? ", selected" : ", not selected"}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <ManageTagInput
            id="manage-custom"
            label="Custom topics"
            helper="Add subjects you’d especially like to follow."
            placeholder="e.g. space exploration"
            values={draft.customTopics}
            onChange={(values) => update("customTopics", values)}
          />
          <ManageTagInput
            id="manage-excluded"
            label="Excluded topics"
            helper="Avoid stories where this is the main subject."
            placeholder="celebrity gossip"
            values={draft.excludedTopics}
            quieter
            onChange={(values) => update("excludedTopics", values)}
          />
        </section>

        <section className={styles.section} aria-labelledby="delivery-heading">
          <div className={styles.manageSectionHeading}>
            <p>03</p>
            <div><h2 id="delivery-heading">Delivery</h2><span>Set your rhythm.</span></div>
          </div>
          <div className={styles.manageStoryControl}>
            <div>
              <label htmlFor="manage-count">Stories in each briefing</label>
              <p>4 stories from every selected category · {draft.storyCount} total.</p>
            </div>
            <div className={styles.manageStepper}>
              <button
                type="button"
                aria-label="Decrease story count"
                disabled
              >−</button>
              <input
                id="manage-count"
                type="number"
                inputMode="numeric"
                min={4}
                max={4}
                value={4}
                readOnly
              />
              <button
                type="button"
                aria-label="Increase story count"
                disabled
              >+</button>
            </div>
          </div>

          <fieldset className={styles.manageChoiceFieldset}>
            <legend>Frequency</legend>
            <div className={styles.manageFrequencyGrid}>
              {DELIVERY_FREQUENCIES.map((frequency) => (
                <label className={styles.manageFrequencyCard} data-selected={draft.frequency === frequency} key={frequency}>
                  <input
                    id={`manage-frequency-${frequency}`}
                    type="radio"
                    name="manage-frequency"
                    checked={draft.frequency === frequency}
                    onChange={() => {
                      update("frequency", frequency);
                      if (frequency !== "weekly") update("weeklyDay", undefined);
                    }}
                  />
                  <span>{DELIVERY_FREQUENCY_LABELS[frequency]}</span>
                  <small>{FREQUENCY_DESCRIPTIONS[frequency]}</small>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.frequency === "weekly" && (
            <div className={`${styles.manageField} ${styles.manageRevealField}`}>
              <label htmlFor="manage-weekday">Delivery day</label>
              <select id="manage-weekday" value={draft.weeklyDay ?? ""} onChange={(event) => update("weeklyDay", event.target.value as Weekday)}>
                <option value="">Choose a day</option>
                {WEEKDAYS.map((day) => <option key={day} value={day}>{WEEKDAY_LABELS[day]}</option>)}
              </select>
            </div>
          )}

          <div className={styles.manageDeliveryFields}>
            <div className={styles.manageTimeField}>
              <label htmlFor="manage-time">Delivery time</label>
              <ManageTimePicker value={draft.deliveryTime} onChange={(value) => update("deliveryTime", value)} />
            </div>
            <div className={styles.manageField}>
              <label htmlFor="manage-timezone">Timezone</label>
              <input id="manage-timezone" value={draft.timezone} maxLength={100} onChange={(event) => update("timezone", event.target.value)} />
              <p className={styles.manageHelper}>Your briefing follows this local time.</p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="theme-heading">
          <div className={styles.manageSectionHeading}>
            <p>04</p>
            <div><h2 id="theme-heading">Appearance</h2><span>Choose the edition you prefer.</span></div>
          </div>
          <div className={styles.themes}>
            {BRIEFING_THEMES.map((theme) => (
              <div className={styles.themeOption} key={theme}>
                <p className={styles.themeOptionLabel}>
                  {BRIEFING_THEME_LABELS[theme]}
                </p>
                <button
                  type="button"
                  className={`${styles.themeCard} ${themeCardClassName(theme)}`}
                  aria-label={`Select ${BRIEFING_THEME_LABELS[theme]} theme`}
                  data-selected={draft.theme === theme}
                  aria-pressed={draft.theme === theme}
                  disabled={themePending}
                  onClick={() => chooseTheme(theme)}
                >
                  <ThemePreview theme={theme} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.dangerZone} aria-label="Subscription">
          <Link className={styles.finishLink} href="/">
            Finish for now
          </Link>
          <Link className={`${styles.dangerButton} ${styles.unsubscribeButton}`} href="/manage/delete">
            Unsubscribe
          </Link>
        </section>
      </div>

      <aside className={styles.sticky} aria-label="Save and delivery status">
        <p className={styles.eyebrow}>Delivery {status}</p>
        <h2>{formattedNext}</h2>
        <p>{status === "active" ? "Your briefing is ready for its next delivery." : "Your briefing will stay quiet until you resume."}</p>
        <button type="button" className={styles.secondaryButton} disabled={controlPending} onClick={changeDeliveryState}>
          {controlPending ? "Updating…" : status === "active" ? "Pause briefing" : "Resume briefing"}
        </button>
        <button className={styles.button} type="submit" disabled={saving}>
          {saving ? "Saving changes…" : "Save changes"}
        </button>
        <div aria-live="polite">
          {notice && <p className={styles.success}>{notice}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </aside>
    </form>
  );
}
