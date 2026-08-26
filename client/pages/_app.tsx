import { GeistSans } from "geist/font/sans";
import type { AppProps } from "next/app";
import "./globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${GeistSans.className} ${GeistSans.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
