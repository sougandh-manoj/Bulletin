"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { PRODUCT, PUBLIC_ROUTES } from "@/config/product";

import styles from "./landing.module.css";

const NAVIGATION_ITEMS = [
  { href: "#your-briefing", label: "Your briefing" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#why-bulletin", label: "Why Bulletin" },
] as const;

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
