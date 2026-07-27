"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { PRODUCT, PUBLIC_ROUTES } from "@/config/product";

import styles from "./landing.module.css";

const NAVIGATION_ITEMS = [
  { href: "#your-briefing", icon: "briefing", label: "Your briefing" },
  { href: "#how-it-works", icon: "process", label: "How it works" },
  { href: "#why-bulletin", icon: "calm", label: "Why Bulletin" },
] as const;

function NavigationIcon({
  icon,
}: {
  icon: (typeof NAVIGATION_ITEMS)[number]["icon"];
}) {
  if (icon === "process") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 7h7" />
        <path d="M12 7l-2-2" />
        <path d="M12 7l-2 2" />
        <path d="M19 17h-7" />
        <path d="M12 17l2-2" />
        <path d="M12 17l2 2" />
        <path d="M6 14a4 4 0 0 1 0-4" />
        <path d="M18 10a4 4 0 0 1 0 4" />
      </svg>
    );
  }

  if (icon === "calm") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 8h14" />
        <path d="M7 12h10" />
        <path d="M9 16h6" />
        <path d="M12 4v2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 5h9l3 3v11H6z" />
      <path d="M15 5v4h3" />
      <path d="M9 12h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

async function scrollToSection(
  event: MouseEvent<HTMLAnchorElement>,
  href: (typeof NAVIGATION_ITEMS)[number]["href"],
  isMenuOpen: boolean,
  closeMenu: () => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = document.querySelector<HTMLElement>(href);

  if (!target) {
    return;
  }

  event.preventDefault();

  if (isMenuOpen) {
    closeMenu();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  const headerHeight =
    document.querySelector<HTMLElement>(`.${styles.siteHeader}`)?.offsetHeight ?? 78;
  const targetY = Math.max(
    0,
    target.getBoundingClientRect().top + window.scrollY - headerHeight,
  );

  window.history.pushState(null, "", href);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo({ top: targetY });
    return;
  }

  const [{ gsap }, { ScrollToPlugin }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollToPlugin"),
  ]);
  const distance = Math.abs(window.scrollY - targetY);
  const duration = Math.min(1.2, Math.max(0.7, distance / 2200));

  gsap.registerPlugin(ScrollToPlugin);
  gsap.to(window, {
    duration,
    ease: "power3.inOut",
    overwrite: "auto",
    scrollTo: {
      autoKill: true,
      offsetY: headerHeight,
      y: target,
    },
  });
}

export function LandingNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  function closeMenu({ returnFocus = false } = {}) {
    setIsOpen(false);
    if (returnFocus) {
      toggleRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusableElements?.[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ returnFocus: true });
        return;
      }

      if (event.key !== "Tab" || !focusableElements?.length) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <Link
          className={styles.wordmark}
          href={PUBLIC_ROUTES.home}
          aria-label={`${PRODUCT.name} home`}
        >
          {PRODUCT.name}
        </Link>

        <nav className={styles.desktopNavigation} aria-label="Primary navigation">
          {NAVIGATION_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) =>
                void scrollToSection(event, item.href, isOpen, closeMenu)
              }
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.manageLink} href={PUBLIC_ROUTES.manageAccess}>
            Manage briefing
          </Link>
          <Link className={styles.headerCta} href={PUBLIC_ROUTES.onboarding}>
            Create my briefing
          </Link>
          <button
            ref={toggleRef}
            className={styles.menuToggle}
            type="button"
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsOpen((current) => !current)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          ref={drawerRef}
          className={styles.mobileDrawer}
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <nav aria-label="Mobile navigation links">
            {NAVIGATION_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) =>
                  void scrollToSection(event, item.href, isOpen, closeMenu)
                }
              >
                <span className={styles.drawerNavIcon}>
                  <NavigationIcon icon={item.icon} />
                </span>
                {item.label}
              </a>
            ))}
          </nav>
          <Link
            className={styles.drawerCta}
            href={PUBLIC_ROUTES.onboarding}
            onClick={() => closeMenu()}
          >
            Create my briefing
          </Link>
        </div>
      ) : null}
    </header>
  );
}
