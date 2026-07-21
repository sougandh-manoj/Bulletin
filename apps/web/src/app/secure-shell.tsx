import Link from "next/link";

import { PRODUCT } from "@/config/product";

import styles from "./secure-access.module.css";

export function SecureShell({
  children,
  linkHref = "/",
  linkLabel = "Back to home",
}: {
  children: React.ReactNode;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.masthead} href="/" aria-label={`${PRODUCT.name} home`}>
          {PRODUCT.name}
        </Link>
        <Link className={styles.headerLink} href={linkHref}>
          {linkLabel}
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{PRODUCT.promise}</footer>
    </div>
  );
}
