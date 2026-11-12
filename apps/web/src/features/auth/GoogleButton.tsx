import { useEffect, useRef, useState } from "react";

/** The small part of Google Identity Services that this app uses. */
type GoogleIdentity = {
  initialize(options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: "popup" }): void;
  renderButton(
    parent: HTMLElement,
    options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; shape: "rectangular"; width: number; locale: string },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
let loading: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("google_identity_missing"));
    };
    script.onerror = () => reject(new Error("google_identity_blocked"));
    document.head.append(script);
  }).catch((err: unknown) => {
    loading = null; // allow another try on the next mount
    throw err;
  });
  return loading;
}

type Props = {
  clientId: string;
  /** "en" or "hi": the button's own text is drawn by Google in this language. */
  locale: string;
  /** Called with the Google ID token. It goes straight to our API and is never stored in the browser. */
  onCredential(credential: string): void;
  /** Called when Google's script cannot be loaded (offline, blocked). */
  onUnavailable(): void;
};

/** Google's own "Continue with Google" button. Google draws it inside an iframe; we only receive the result. */
export function GoogleButton({ clientId, locale, onCredential, onUnavailable }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Keep the latest callbacks without re-creating Google's button on every render.
  const callbacks = useRef({ onCredential, onUnavailable });
  callbacks.current = { onCredential, onUnavailable };

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity().then(
      (google) => {
        if (cancelled || !holder.current) return;
        google.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: (response) => {
            if (response.credential) callbacks.current.onCredential(response.credential);
          },
        });
        const width = Math.min(400, Math.max(200, Math.floor(holder.current.clientWidth)));
        google.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width,
          locale,
        });
        setReady(true);
      },
      () => {
        if (!cancelled) callbacks.current.onUnavailable();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clientId, locale]);

  return <div ref={holder} data-testid="google-button" aria-busy={!ready} className="flex min-h-12 w-full justify-center" />;
}
