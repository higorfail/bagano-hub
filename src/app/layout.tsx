import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bagano Hub",
  description: "Hub interno Bagano",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Prevent flash of wrong theme before hydration */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('bagano-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');else if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()` }} />
        {/* Theme CSS variables — outside Tailwind pipeline so selectors survive */}
        <style dangerouslySetInnerHTML={{ __html: `
/* ── Base tokens (light) ─────────────────────────────────────────────── */
:root {
  /* Surface */
  --color-bg-page:#F9F8F5;
  --color-bg-card:#FFFFFF;
  --color-bg-subtle:#F2F0EB;
  --color-bg-alt:#FBFAF8;
  --color-bg-input:#F9F8F5;
  /* Text */
  --color-text-primary:#1A1916;
  --color-text-secondary:#6B6963;
  --color-text-muted:#A8A59E;
  --color-text-faint:#C8C5BE;
  /* Border */
  --color-border:#EBEAE5;
  --color-border-hover:#D4D1CB;
  --color-border-strong:#D4D0C8;
  /* Brand */
  --color-brand:#1A1916;
  --color-brand-fg:#FFFFFF;
  --color-logo:#7c0006;
  /* Accent (Bagano red) */
  --color-accent:#E5384A;
  --color-accent-hover:#C82333;
  --color-accent-bg:#FDECEC;
  --color-accent-fg:#FFFFFF;
  /* Elevation */
  --shadow-card:0 1px 2px rgba(26,25,22,0.04),0 4px 16px rgba(26,25,22,0.05);
  --shadow-pop:0 8px 28px rgba(26,25,22,0.12);

  /* ── Semantic alert tokens ──────────────────────────────────────────── */
  /* Error / danger */
  --ds-error-bg:#fff1f2;
  --ds-error-border:#fecdd3;
  --ds-error-text:#9f1239;
  --ds-error-accent:#e11d48;
  --ds-error-muted:#be123c;
  /* Warning / orange */
  --ds-warn-bg:#fff7ed;
  --ds-warn-border:#fed7aa;
  --ds-warn-text:#9a3412;
  --ds-warn-accent:#ea580c;
  --ds-warn-muted:#c2410c;
  /* Caution / amber */
  --ds-caution-bg:#fffbeb;
  --ds-caution-border:#fde68a;
  --ds-caution-text:#92400e;
  --ds-caution-accent:#d97706;
  /* Success */
  --ds-success-bg:#f0fdf4;
  --ds-success-border:#bbf7d0;
  --ds-success-text:#166534;
  --ds-success-accent:#16a34a;
  /* Info / blue */
  --ds-info-bg:#eff6ff;
  --ds-info-border:#bfdbfe;
  --ds-info-text:#1e40af;
  --ds-info-accent:#2563eb;
  /* Purple */
  --ds-purple-bg:#faf5ff;
  --ds-purple-border:#e9d5ff;
  --ds-purple-text:#6b21a8;
  --ds-purple-accent:#9333ea;
}

/* ── Dark tokens ──────────────────────────────────────────────────────── */
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --color-bg-page:#1C1A18;--color-bg-card:#252320;--color-bg-subtle:#2E2C29;--color-bg-alt:#211F1D;--color-bg-input:#252320;
  --color-text-primary:#E8E4DC;--color-text-secondary:#9B9891;--color-text-muted:#8A8780;--color-text-faint:#5A5854;
  --color-border:#333028;--color-border-hover:#3D3A36;--color-border-strong:#484440;
  --color-brand:#E8E4DC;--color-brand-fg:#1A1916;--color-logo:#d44040;
  --color-accent:#F2555F;--color-accent-hover:#F87171;--color-accent-bg:#2A1517;--color-accent-fg:#FFFFFF;
  --shadow-card:0 1px 2px rgba(0,0,0,0.25),0 4px 16px rgba(0,0,0,0.3);--shadow-pop:0 8px 28px rgba(0,0,0,0.45);
  --ds-error-bg:#1f0a0a;--ds-error-border:#7f1d1d;--ds-error-text:#fca5a5;--ds-error-accent:#f87171;--ds-error-muted:#fca5a5;
  --ds-warn-bg:#1c0f08;--ds-warn-border:#7c2d12;--ds-warn-text:#fdba74;--ds-warn-accent:#fb923c;--ds-warn-muted:#fdba74;
  --ds-caution-bg:#1c1005;--ds-caution-border:#78350f;--ds-caution-text:#fde68a;--ds-caution-accent:#fbbf24;
  --ds-success-bg:#052e16;--ds-success-border:#14532d;--ds-success-text:#86efac;--ds-success-accent:#4ade80;
  --ds-info-bg:#0d1628;--ds-info-border:#1e3a5f;--ds-info-text:#93c5fd;--ds-info-accent:#60a5fa;
  --ds-purple-bg:#150c2a;--ds-purple-border:#4c1d95;--ds-purple-text:#d8b4fe;--ds-purple-accent:#c084fc;
}}

[data-theme="dark"]{
  --color-bg-page:#1C1A18;--color-bg-card:#252320;--color-bg-subtle:#2E2C29;--color-bg-alt:#211F1D;--color-bg-input:#252320;
  --color-text-primary:#E8E4DC;--color-text-secondary:#9B9891;--color-text-muted:#8A8780;--color-text-faint:#5A5854;
  --color-border:#333028;--color-border-hover:#3D3A36;--color-border-strong:#484440;
  --color-brand:#E8E4DC;--color-brand-fg:#1A1916;--color-logo:#d44040;
  --color-accent:#F2555F;--color-accent-hover:#F87171;--color-accent-bg:#2A1517;--color-accent-fg:#FFFFFF;
  --shadow-card:0 1px 2px rgba(0,0,0,0.25),0 4px 16px rgba(0,0,0,0.3);--shadow-pop:0 8px 28px rgba(0,0,0,0.45);
  --ds-error-bg:#1f0a0a;--ds-error-border:#7f1d1d;--ds-error-text:#fca5a5;--ds-error-accent:#f87171;--ds-error-muted:#fca5a5;
  --ds-warn-bg:#1c0f08;--ds-warn-border:#7c2d12;--ds-warn-text:#fdba74;--ds-warn-accent:#fb923c;--ds-warn-muted:#fdba74;
  --ds-caution-bg:#1c1005;--ds-caution-border:#78350f;--ds-caution-text:#fde68a;--ds-caution-accent:#fbbf24;
  --ds-success-bg:#052e16;--ds-success-border:#14532d;--ds-success-text:#86efac;--ds-success-accent:#4ade80;
  --ds-info-bg:#0d1628;--ds-info-border:#1e3a5f;--ds-info-text:#93c5fd;--ds-info-accent:#60a5fa;
  --ds-purple-bg:#150c2a;--ds-purple-border:#4c1d95;--ds-purple-text:#d8b4fe;--ds-purple-accent:#c084fc;
}

[data-theme="light"]{
  --color-bg-page:#F9F8F5;--color-bg-card:#FFFFFF;--color-bg-subtle:#F2F0EB;--color-bg-alt:#FBFAF8;--color-bg-input:#F9F8F5;
  --color-text-primary:#1A1916;--color-text-secondary:#6B6963;--color-text-muted:#A8A59E;--color-text-faint:#C8C5BE;
  --color-border:#EBEAE5;--color-border-hover:#D4D1CB;--color-border-strong:#D4D0C8;
  --color-brand:#1A1916;--color-brand-fg:#FFFFFF;
  --color-accent:#E5384A;--color-accent-hover:#C82333;--color-accent-bg:#FDECEC;--color-accent-fg:#FFFFFF;
  --shadow-card:0 1px 2px rgba(26,25,22,0.04),0 4px 16px rgba(26,25,22,0.05);--shadow-pop:0 8px 28px rgba(26,25,22,0.12);
  --ds-error-bg:#fff1f2;--ds-error-border:#fecdd3;--ds-error-text:#9f1239;--ds-error-accent:#e11d48;--ds-error-muted:#be123c;
  --ds-warn-bg:#fff7ed;--ds-warn-border:#fed7aa;--ds-warn-text:#9a3412;--ds-warn-accent:#ea580c;--ds-warn-muted:#c2410c;
  --ds-caution-bg:#fffbeb;--ds-caution-border:#fde68a;--ds-caution-text:#92400e;--ds-caution-accent:#d97706;
  --ds-success-bg:#f0fdf4;--ds-success-border:#bbf7d0;--ds-success-text:#166534;--ds-success-accent:#16a34a;
  --ds-info-bg:#eff6ff;--ds-info-border:#bfdbfe;--ds-info-text:#1e40af;--ds-info-accent:#2563eb;
  --ds-purple-bg:#faf5ff;--ds-purple-border:#e9d5ff;--ds-purple-text:#6b21a8;--ds-purple-accent:#9333ea;
}
        `}} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
