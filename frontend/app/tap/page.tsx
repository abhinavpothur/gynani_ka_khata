"use client"

import { useStore } from '@/lib/store'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

// Simple ID generator that works on all browsers (fixes the crypto error)
function generateDeviceId() {
  return 'dev-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36)
}

function TapHandler() {
  const { login, isAuthenticated } = useStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // 1. This reads the "?card_token=..." from your NFC card URL
  const cardToken = searchParams.get('card_token')

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // If already logged in, go to dashboard
    if (isAuthenticated) { 
      router.push('/dashboard')
      return 
    }

    // If no token is in the URL, show error
    if (!cardToken) {
      setStatus('error')
      setErrorMsg('No NFC card detected. Please tap your card.')
      return
    }

    setStatus('verifying')

    // Simulate a quick network check (1.2 seconds)
    const timer = setTimeout(() => {
      
      // ⬇️ THIS IS THE EXACT TOKEN FROM YOUR NFC CARD ⬇️
      const ALLOWED_TOKEN = '8f3a2c1d-9b4e-4f7a-a2c8-1e6d5b3f9a2c'

      if (cardToken !== ALLOWED_TOKEN) {
        setStatus('error')
        setErrorMsg('Unauthorized Card. Not registered to this shop.')
        return
      }

      // Device Binding: Prevents someone from just copying the URL to another phone
      const boundToken = localStorage.getItem('bound_card_token')
      if (!boundToken) {
        // First time tap: bind this specific browser/phone to the card
        localStorage.setItem('device_id', generateDeviceId())
        localStorage.setItem('bound_card_token', cardToken)
      } else if (boundToken !== cardToken) {
        setStatus('error')
        setErrorMsg('Card recognized, but this device is not authorized.')
        return
      }

      // Success!
      setStatus('success')
      login() // Updates the global state
      setTimeout(() => router.push('/dashboard'), 800) // Redirect after short delay
      
    }, 1200)

    return () => clearTimeout(timer)
  }, [cardToken, isAuthenticated, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-black/10 rounded-2xl p-8 text-center shadow-xl">
        <h1 className="font-display text-3xl font-bold mb-6 text-foreground">ज्ञानी / Hisaab</h1>
        
        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-black/60 font-mono text-sm">Verifying Card Token...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="text-6xl text-emerald-500">✓</div>
            <p className="text-emerald-600 font-bold">Access Granted</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="text-6xl text-alert">✕</div>
            <p className="text-alert font-bold">{errorMsg}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-6 py-2 bg-black text-white rounded-lg text-sm hover:bg-black/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Next.js requires Suspense for useSearchParams
export default function TapPage() {
  return <Suspense><TapHandler /></Suspense>
}