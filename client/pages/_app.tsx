import { GeistSans } from "geist/font/sans";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { restoreAccessToken } from "../lib/api/auth/session";
import "./globals.css";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    void restoreAccessToken().catch(() => undefined);
  }, []);

  return (
    <div className={`${GeistSans.className} ${GeistSans.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
