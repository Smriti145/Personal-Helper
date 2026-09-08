import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Saha — Your daily health ally',
  description: 'A calm, supportive health and routine companion for busy days.',
  openGraph: {
    title: 'Saha — Your daily health ally',
    description: 'A calm, supportive health and routine companion for busy days.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Saha — Your daily health ally',
    description: 'A calm, supportive health and routine companion for busy days.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
