"use client";

import { useEffect } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function LandingScrollReveal() {
  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;

    async function setupAnimations() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled) {
        return;
      }

      const root = document.querySelector<HTMLElement>("[data-scroll-reveal-root]");

      if (!root) {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);

      const media = gsap.matchMedia();

      media.add(
        {
          motion: MOTION_QUERY,
          coarsePointer: COARSE_POINTER_QUERY,
        },
        (context) => {
          if (!context.conditions?.motion) {
            return;
          }

          const coarsePointer = Boolean(context.conditions.coarsePointer);
          const distance = coarsePointer ? 20 : 30;
          const duration = coarsePointer ? 0.76 : 0.96;
          const start = coarsePointer ? "top 92%" : "top 87%";

          const reveal = (targets: HTMLElement[], trigger: HTMLElement, stagger = 0) => {
            if (targets.length === 0 || trigger.getBoundingClientRect().bottom <= 0) {
              return;
            }

            gsap.set(targets, {
              autoAlpha: 0,
              transition: "none",
              y: distance,
            });
            gsap.to(targets, {
              autoAlpha: 1,
              clearProps: "opacity,transform,transition,visibility,will-change",
              duration,
              ease: "power3.out",
              force3D: true,
              onStart: () => {
                gsap.set(targets, { willChange: "transform, opacity" });
              },
              stagger,
              y: 0,
              scrollTrigger: {
                trigger,
                start,
                once: true,
                invalidateOnRefresh: true,
              },
            });
          };

          const heroTargets = Array.from(
            root.querySelectorAll<HTMLElement>("[data-reveal-hero]"),
          );

          if (window.scrollY < 80 && heroTargets.length > 0) {
            gsap.set(heroTargets, {
              autoAlpha: 0,
              transition: "none",
              willChange: "transform, opacity",
              y: coarsePointer ? 16 : 24,
            });
            gsap.to(heroTargets, {
              autoAlpha: 1,
              clearProps: "opacity,transform,transition,visibility,will-change",
              delay: 0.08,
              duration: coarsePointer ? 0.8 : 1.08,
              ease: "power3.out",
              force3D: true,
              stagger: 0.12,
              y: 0,
            });
          }

          root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
            reveal([element], element);
          });

          root
            .querySelectorAll<HTMLElement>("[data-reveal-group]")
            .forEach((group) => {
              const items = Array.from(group.children).filter(
                (child): child is HTMLElement =>
                  child instanceof HTMLElement && child.hasAttribute("data-reveal-item"),
              );

              reveal(items, group, coarsePointer ? 0.06 : 0.09);
            });
        },
      );

      const refresh = () => {
        if (!cancelled) {
          window.requestAnimationFrame(() => ScrollTrigger.refresh());
        }
      };

      void document.fonts?.ready.then(refresh);
      teardown = () => media.revert();
    }

    void setupAnimations();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return null;
}
