"use client"

import { useStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Home() {
  const { login } = useStore()
  const router = useRouter()
  const [isTapping, setIsTapping] = useState(false)

  const handleTap = () => {
    setIsTapping(true)
    setTimeout(() => {
      login()
      router.push('/dashboard')
    }, 1200)
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-8 overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      
      {/* Top Bar */}
      <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-center text-xs font-mono uppercase tracking-widest text-black/40">
        <span>System Ready</span>
        <span>v2.0.4 / Secure Link</span>
      </div>

      <div className="relative z-10 text-center space-y-12 max-w-2xl">
        {/* Typography */}
        <div className="space-y-4">
          <h1 className="font-display text-7xl md:text-9xl font-light tracking-tighter leading-none text-foreground">
            ज्ञानी <span className="text-accent">/</span> Hisaab
          </h1>
          <p className="text-black/50 text-lg font-light tracking-wide">
            Voice-first ledger infrastructure for the modern kirana.
          </p>
        </div>

        {/* NFC Interaction Zone */}
        <div 
          onClick={handleTap}
          className={`
            relative mx-auto w-80 h-48 border border-black/10 bg-surface/50 backdrop-blur-sm
            flex flex-col items-center justify-center cursor-pointer transition-all duration-500
            hover:border-accent hover:bg-accent/5 group
            ${isTapping ? 'border-accent bg-accent/10 scale-95' : ''}
          `}
        >
          <div className={`text-5xl mb-4 transition-all duration-300 ${isTapping ? 'scale-110 text-accent' : 'group-hover:scale-105 text-foreground'}`}>
            ◉
          </div>
          
          <p className="font-mono text-sm uppercase tracking-widest text-black/60 group-hover:text-accent transition-colors">
            {isTapping ? 'Authenticating...' : 'Tap to Authenticate'}
          </p>
          <p className="text-[10px] text-black/30 mt-2 font-mono">NFC / HARDWARE BRIDGE</p>
        </div>

        {/* Footer Info */}
        <div className="text-[10px] font-mono text-black/20 uppercase tracking-widest space-y-1">
          <p>Team Trojan Hex • NMIT Bengaluru</p>
          <p>Powered by Gnani Prisma v3.0 & Timbre v3.0</p>
        </div>
      </div>
    </main>
  )
}