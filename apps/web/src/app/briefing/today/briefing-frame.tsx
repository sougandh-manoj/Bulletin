"use client";

import { useCallback, useState } from "react";

import styles from "./briefing.module.css";

export function BriefingFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState(900);
  const resize = useCallback((frame: HTMLIFrameElement) => {
    const document = frame.contentDocument;
    if (!document) return;
    setHeight(Math.max(640, document.documentElement.scrollHeight));
  }, []);

  return (
    <iframe
      className={styles.frame}
      onLoad={(event) => resize(event.currentTarget)}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={html}
      style={{ height }}
      title={title}
    />
  );
}
