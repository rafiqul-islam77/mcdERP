import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import * as React from 'react'
import './globals.css'
import { GlobalProgressBar } from '@/components/ui/progress-bar'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'GMS ERP',
    template: '%s | GMS ERP',
  },
  description: 'GMS Needle Management Enterprise Resource Planning System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={`${inter.className} font-sans antialiased bg-surface text-ink`}>
        <React.Suspense fallback={null}>
          <GlobalProgressBar />
        </React.Suspense>
        {children}
      </body>
    </html>
  )
}
