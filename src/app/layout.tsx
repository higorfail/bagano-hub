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
:root {
  --color-text-primary:#1A1916;--color-text-secondary:#6B6963;--color-text-muted:#A8A59E;--color-text-faint:#C8C5BE;
  --color-bg-page:#F9F8F5;--color-bg-card:#FFFFFF;--color-bg-subtle:#F2F0EB;--color-bg-alt:#FBFAF8;--color-bg-input:#F9F8F5;
  --color-border:#EBEAE5;--color-border-hover:#D4D1CB;--color-border-strong:#D4D0C8;
  --color-brand:#1A1916;--color-brand-fg:#FFFFFF;
}

/* shared dark palette — applied by media query (auto) or data-theme (manual) */
.dark-vars {
  --color-text-primary:#E8E4DC;--color-text-secondary:#9B9891;--color-text-muted:#9B9891;--color-text-faint:#6B6963;
  --color-bg-page:#1C1A18;--color-bg-card:#252320;--color-bg-subtle:#2E2C29;--color-bg-alt:#211F1D;--color-bg-input:#252320;
  --color-border:#333028;--color-border-hover:#3D3A36;--color-border-strong:#484440;
  --color-brand:#E8E4DC;--color-brand-fg:#1A1916;
  /* Tailwind green — tints become dark, text becomes light */
  --color-green-50:#052e16;--color-green-100:#14532d;--color-green-200:#166534;
  --color-green-600:#4ade80;--color-green-700:#86efac;--color-green-800:#bbf7d0;
  /* Tailwind blue */
  --color-blue-50:#172554;--color-blue-100:#1e3a5f;--color-blue-200:#1d4ed8;
  --color-blue-600:#60a5fa;--color-blue-700:#93c5fd;--color-blue-800:#bfdbfe;
  /* Tailwind red */
  --color-red-50:#450a0a;--color-red-100:#7f1d1d;--color-red-200:#991b1b;
  --color-red-500:#f87171;--color-red-600:#fca5a5;
  /* Tailwind amber */
  --color-amber-50:#431407;--color-amber-100:#78350f;--color-amber-200:#92400e;
  --color-amber-600:#fbbf24;--color-amber-700:#fde68a;
  /* Tailwind yellow */
  --color-yellow-50:#422006;--color-yellow-100:#713f12;--color-yellow-700:#fef08a;
  /* Tailwind orange */
  --color-orange-50:#431407;--color-orange-100:#7c2d12;--color-orange-200:#9a3412;
  --color-orange-500:#fb923c;--color-orange-600:#fdba74;--color-orange-700:#fed7aa;
  /* Tailwind purple */
  --color-purple-50:#2e1065;--color-purple-100:#4a044e;--color-purple-600:#c084fc;--color-purple-700:#d8b4fe;
  /* Tailwind indigo */
  --color-indigo-50:#1e1b4b;--color-indigo-100:#312e81;--color-indigo-600:#818cf8;
  /* Tailwind gray */
  --color-gray-50:#1f2937;--color-gray-100:#374151;--color-gray-200:#4b5563;--color-gray-700:#d1d5db;
}

@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]) {
    --color-text-primary:#E8E4DC;--color-text-secondary:#9B9891;--color-text-muted:#9B9891;--color-text-faint:#6B6963;
    --color-bg-page:#1C1A18;--color-bg-card:#252320;--color-bg-subtle:#2E2C29;--color-bg-alt:#211F1D;--color-bg-input:#252320;
    --color-border:#333028;--color-border-hover:#3D3A36;--color-border-strong:#484440;
    --color-brand:#E8E4DC;--color-brand-fg:#1A1916;
    --color-green-50:#052e16;--color-green-100:#14532d;--color-green-200:#166534;--color-green-600:#4ade80;--color-green-700:#86efac;--color-green-800:#bbf7d0;
    --color-blue-50:#172554;--color-blue-100:#1e3a5f;--color-blue-600:#60a5fa;--color-blue-700:#93c5fd;--color-blue-800:#bfdbfe;
    --color-red-50:#450a0a;--color-red-100:#7f1d1d;--color-red-500:#f87171;--color-red-600:#fca5a5;
    --color-amber-50:#431407;--color-amber-100:#78350f;--color-amber-600:#fbbf24;--color-amber-700:#fde68a;
    --color-yellow-50:#422006;--color-yellow-100:#713f12;--color-yellow-700:#fef08a;
    --color-orange-50:#431407;--color-orange-100:#7c2d12;--color-orange-500:#fb923c;--color-orange-600:#fdba74;--color-orange-700:#fed7aa;
    --color-purple-50:#2e1065;--color-purple-100:#4a044e;--color-purple-600:#c084fc;--color-purple-700:#d8b4fe;
    --color-indigo-50:#1e1b4b;--color-indigo-100:#312e81;--color-indigo-600:#818cf8;
    --color-gray-50:#1f2937;--color-gray-100:#374151;--color-gray-200:#4b5563;
    --color-gray-300:#6b7280;--color-gray-400:#9ca3af;--color-gray-500:#d1d5db;
    --color-gray-700:#e5e7eb;--color-gray-800:#f3f4f6;--color-gray-900:#f9fafb;
  }
}

[data-theme="dark"]{
  --color-text-primary:#E8E4DC;--color-text-secondary:#9B9891;--color-text-muted:#9B9891;--color-text-faint:#6B6963;
  --color-bg-page:#1C1A18;--color-bg-card:#252320;--color-bg-subtle:#2E2C29;--color-bg-alt:#211F1D;--color-bg-input:#252320;
  --color-border:#333028;--color-border-hover:#3D3A36;--color-border-strong:#484440;
  --color-brand:#E8E4DC;--color-brand-fg:#1A1916;
  --color-green-50:#052e16;--color-green-100:#14532d;--color-green-200:#166534;--color-green-600:#4ade80;--color-green-700:#86efac;--color-green-800:#bbf7d0;
  --color-blue-50:#172554;--color-blue-100:#1e3a5f;--color-blue-600:#60a5fa;--color-blue-700:#93c5fd;--color-blue-800:#bfdbfe;
  --color-red-50:#450a0a;--color-red-100:#7f1d1d;--color-red-500:#f87171;--color-red-600:#fca5a5;
  --color-amber-50:#431407;--color-amber-100:#78350f;--color-amber-600:#fbbf24;--color-amber-700:#fde68a;
  --color-yellow-50:#422006;--color-yellow-100:#713f12;--color-yellow-700:#fef08a;
  --color-orange-50:#431407;--color-orange-100:#7c2d12;--color-orange-500:#fb923c;--color-orange-600:#fdba74;--color-orange-700:#fed7aa;
  --color-purple-50:#2e1065;--color-purple-100:#4a044e;--color-purple-600:#c084fc;--color-purple-700:#d8b4fe;
  --color-indigo-50:#1e1b4b;--color-indigo-100:#312e81;--color-indigo-600:#818cf8;
  --color-gray-50:#1f2937;--color-gray-100:#374151;--color-gray-200:#4b5563;
  --color-gray-300:#6b7280;--color-gray-400:#9ca3af;--color-gray-500:#d1d5db;
  --color-gray-700:#e5e7eb;--color-gray-800:#f3f4f6;--color-gray-900:#f9fafb;
}

[data-theme="light"]{
  --color-text-primary:#1A1916;--color-text-secondary:#6B6963;--color-text-muted:#A8A59E;--color-text-faint:#C8C5BE;
  --color-bg-page:#F9F8F5;--color-bg-card:#FFFFFF;--color-bg-subtle:#F2F0EB;--color-bg-alt:#FBFAF8;--color-bg-input:#F9F8F5;
  --color-border:#EBEAE5;--color-border-hover:#D4D1CB;--color-border-strong:#D4D0C8;
  --color-brand:#1A1916;--color-brand-fg:#FFFFFF;
}
        `}} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
