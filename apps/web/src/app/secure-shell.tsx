import Link from "next/link";

import { PRODUCT } from "@/config/product";

import styles from "./secure-access.module.css";
import { SignOutButton } from "./sign-out-button";

export function SecureShell({
  children,
  linkHref = "/",
  linkLabel = "Back to home",
  showSignOut = false,
}: {
  children: React.ReactNode;
  linkHref?: string;
  linkLabel?: string | null;
  showSignOut?: boolean;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.masthead} href="/" aria-label={`${PRODUCT.name} home`}>
          {PRODUCT.name}
        </Link>
        {showSignOut ? (
          <SignOutButton className={styles.signOutButton} />
        ) : linkLabel && (
          <Link className={styles.headerLink} href={linkHref}>
            {linkLabel}
          </Link>
        )}
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{PRODUCT.promise}</footer>
    </div>
  );
}
