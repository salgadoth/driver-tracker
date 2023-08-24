import { Navbar } from './components/Navbar'
import ThemeRegistry from './components/ThemeRegistry/ThemeRegistry'
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sitema de Rastreabilidade de veículos.',
  description: 'Generated by create next app',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Navbar />
            {children}
        </ThemeRegistry>
      </body>
    </html>
  )
}
