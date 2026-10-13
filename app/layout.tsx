import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'be-electric — Qatar EV Charger Finder', description: 'Explore Qatar EV charging locations with Q-Auto as your starting point.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
