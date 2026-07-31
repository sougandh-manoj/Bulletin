"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { PRODUCT, PUBLIC_ROUTES } from "@/config/product";

import styles from "./landing.module.css";
import { SignOutButton } from "./sign-out-button";

const NAVIGATION_ITEMS = [
  { href: "#your-briefing", label: "Your briefing" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#why-bulletin", label: "Why Bulletin" },
] as const;

async function scrollToSection(
  event: MouseEvent<HTMLAnchorElement>,
  href: (typeof NAVIGATION_ITEMS)[number]["href"],
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

export function LandingNavigation({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <h1 className={styles.wordmark}>
          <Link
            href={PUBLIC_ROUTES.home}
            aria-label={`${PRODUCT.name} home`}
          >
            {PRODUCT.name}
          </Link>
        </h1>

        <nav className={styles.desktopNavigation} aria-label="Primary navigation">
          {NAVIGATION_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) =>
                void scrollToSection(event, item.href)
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
          {signedIn ? (
            <SignOutButton className={styles.signOutButton} />
          ) : (
            <Link className={styles.headerCta} href={PUBLIC_ROUTES.onboarding}>
              Create my briefing
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
