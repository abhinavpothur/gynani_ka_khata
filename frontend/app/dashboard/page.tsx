"use client"

import { useStore } from '@/lib/store'
import { useLiveLedger } from '@/lib/live'
import { useRouter } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'

export default function DashboardPage() {
  useLiveLedger()
  const {
    isAuthenticated, logout, customers, activityLog, recentEntries,
    searchQuery, setSearchQuery, sendReminder,
    notification, clearNotification,
    backendConnected, liveStatus, lastTranscript, lastReply, latency, disclosureShown,
  } = useStore()
  const router = useRouter()
  const [reminderMsg, setReminderMsg] = useState('')

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => clearNotification(), 4000)
      return () => clearTimeout(timer)
    }
  }, [notification, clearNotification])

  if (!isAuthenticated) { router.push('/'); return null }

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [customers, searchQuery])

  const topDebtors = useMemo(() => {
    return [...customers].sort((a, b) => b.balance - a.balance).slice(0, 3)
  }, [customers])

  const totalUdhaar = customers.reduce((sum, c) => sum + c.balance, 0)
  const overLimitCount = customers.filter(c => c.status === 'over-limit').length

  const handleGenerateReminder = (id: string) => {
    const msg = sendReminder(id)
    setReminderMsg(msg)
    setTimeout(() => setReminderMsg(''), 6000)
  }

  const isGreen = liveStatus === 'listening'
  const isYellow = liveStatus === 'saved'
  const isRed = liveStatus === 'limit' || liveStatus === 'over-limit'

  return (
    <div className="min-h-screen bg-background text-foreground relative">

      {notification && (
        <div className="fixed top-24 right-8 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className="bg-surface border border-[#25D366]/30 shadow-2xl rounded-xl p-4 flex items-center gap-4 max-w-sm">
            <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#128C7E] fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            </div>
            <div>
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">WhatsApp Sent</p>
              <p className="text-sm text-black/70 mt-0.5">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40" />

      <header className="relative z-10 border-b border-black/10 px-4 md:px-8 py-5 flex justify-between items-center bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight">ज्ञानी <span className="text-accent">/</span> Hisaab</h1>
          <span className="text-[10px] font-mono text-black/30 border border-black/10 px-2 py-0.5 rounded-sm">SMART HUB v1.0</span>
        </div>
        <div className="flex items-center gap-4 md:gap-6 text-xs font-mono uppercase tracking-widest text-black/50">
          <span className={`flex items-center gap-2 ${backendConnected ? 'text-accent' : 'text-alert'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${backendConnected ? 'bg-accent animate-pulse' : 'bg-alert'}`} />
            <span className="hidden md:inline">{backendConnected ? 'Backend Live' : 'Offline · Mock'}</span>
          </span>
          <button onClick={() => { logout(); router.push('/') }} className="hover:text-foreground transition-colors">
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-px bg-black/10 border-b border-black/10">

        {/* LEFT COLUMN: Customer Ledger */}
        <div className="col-span-12 lg:col-span-8 bg-background p-4 md:p-8 lg:p-12 space-y-8 md:space-y-12">

          {/* FIXED: Responsive Stats Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0">
            <div className="md:border-r md:border-black/10 md:pr-8">
              <p className="text-[10px] font-mono uppercase tracking-widest text-black/40 mb-3">Total Outstanding</p>
              <h2 className="font-display text-5xl md:text-7xl font-light tracking-tighter text-foreground leading-none">
                ₹{totalUdhaar.toLocaleString()}
              </h2>
              <p className="text-xs text-black/30 mt-4 font-mono">{customers.length} ACTIVE ACCOUNTS</p>
            </div>
            <div className="md:pl-8">
              <p className="text-[10px] font-mono uppercase tracking-widest text-black/40 mb-3">Risk Exposure</p>
              <h2 className="font-display text-4xl md:text-5xl font-light tracking-tighter text-alert leading-none">
                {overLimitCount}
              </h2>
              <p className="text-xs text-black/30 mt-4 font-mono">ACCOUNTS OVER LIMIT</p>
            </div>
          </div>

          <div className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH LEDGER..."
              className="w-full bg-transparent border-b border-black/20 py-4 text-xl font-display focus:border-accent outline-none transition-colors placeholder:text-black/20 text-foreground"
            />
            <span className="absolute right-0 top-4 text-xs font-mono text-black/30 group-focus-within:text-accent transition-colors">
              {filteredCustomers.length} RESULTS
            </span>
          </div>

          <div className="space-y-0">
            <div className="flex justify-between items-center py-2 border-b border-black/10 text-[10px] font-mono uppercase tracking-widest text-black/40">
              <span>Customer Name</span>
              <span>Balance / Status</span>
            </div>

            {filteredCustomers.length === 0 ? (
              <p className="text-black/30 text-center py-12 font-mono text-sm">NO RECORDS FOUND</p>
            ) : (
              filteredCustomers.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-5 border-b border-black/5 hover:bg-black/5 transition-colors group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      c.status === 'ok' ? 'bg-black/20' :
                      c.status === 'over-limit' ? 'bg-alert' : 'bg-yellow-600'
                    }`} />
                    <div>
                      <button
                        onClick={() => router.push(`/customer/${c.id}`)}
                        className="font-display text-lg group-hover:text-accent transition-colors text-left hover:underline decoration-accent decoration-2 underline-offset-4 bg-transparent border-none p-0 cursor-pointer"
                      >
                        {c.name}
                      </button>
                      <p className="text-[10px] font-mono text-black/30 mt-0.5">LIMIT: ₹{c.limit} • {c.lastTransaction}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className={`font-mono text-lg font-medium ${c.balance > 0 ? 'text-foreground' : 'text-emerald-700'}`}>
                        {c.balance > 0 ? '' : '-'}₹{c.balance}
                      </p>
                      {c.status === 'over-limit' && <p className="text-[9px] text-alert font-bold uppercase tracking-wider mt-1">Over Limit</p>}
                    </div>
                    <button
                      onClick={() => handleGenerateReminder(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] font-mono uppercase border border-black/20 px-3 py-1.5 hover:border-accent hover:text-accent transition-all"
                    >
                      Notify
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Smart Counter Hub & Live Pipeline */}
        <div className="col-span-12 lg:col-span-4 bg-surface p-4 md:p-8 lg:p-10 space-y-10 border-l border-black/10">

          <div className="space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">Smart Counter Hub</p>
            <div className="border border-black/10 rounded-xl p-6 bg-background space-y-6">
              
              <div className="flex justify-center gap-4">
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${isGreen ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-black/10'}`} title="Listening" />
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${isYellow ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)]' : 'bg-black/10'}`} title="Saved" />
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${isRed ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-black/10'}`} title="Over Limit" />
              </div>

              <div className="text-center space-y-2">
                <p className="text-[10px] font-mono uppercase text-black/40">Last Entry</p>
                <p className="font-display text-2xl font-medium text-foreground break-words">
                  {lastTranscript ? lastTranscript : "Waiting for voice..."}
                </p>
                <p className="text-sm text-black/60 font-mono break-words">
                  {lastReply ? `Reply: ${lastReply}` : ""}
                </p>
              </div>

              <div className="border-t border-black/10 pt-4 space-y-2">
                {(latency.stt != null || latency.firstAudio != null) && (
                  <p className="text-[10px] font-mono text-accent text-center">
                    ⚡ stt {latency.stt ?? '–'}s · first audio {latency.firstAudio ?? '–'}s
                  </p>
                )}
                {disclosureShown && <p className="text-[9px] font-mono text-emerald-700 text-center">AI DISCLOSURE SPOKEN ✓</p>}
              </div>
            </div>
          </div>

          {/* Live Entry Feed */}
          {recentEntries.length > 0 && (
            <div className="space-y-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">Live Entry Feed</p>
              <div className="space-y-2">
                {recentEntries.map((e, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-background border border-black/10 rounded-lg animate-in slide-in-from-top-2 fade-in">
                    <div>
                      <p className="font-display text-sm font-medium">{e.name}</p>
                      <p className="text-[9px] font-mono text-black/40">{e.time} • Bal: ₹{e.balance}</p>
                    </div>
                    <p className={`font-mono font-bold ${e.kind === 'credit' ? 'text-alert' : 'text-emerald-600'}`}>
                      {e.kind === 'credit' ? '+' : '-'}₹{e.amount}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">Top Debtors</p>
            <div className="space-y-3">
              {topDebtors.map((c, i) => (
                <div key={c.id} className="flex justify-between items-center py-2 border-b border-black/5">
                  <span className="text-sm font-mono text-black/60">
                    <span className="text-black/20 mr-2">0{i + 1}</span> {c.name}
                  </span>
                  <span className="font-mono text-sm text-alert">₹{c.balance}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">System Log</p>
            <div className="space-y-2 max-h-[150px] overflow-y-auto font-mono text-xs">
              {activityLog.slice(0, 6).map((log) => (
                <div key={log.id} className="flex gap-3 text-black/50">
                  <span className="text-black/20">[{log.timestamp}]</span>
                  <span className={log.type === 'hardware-entry' ? 'text-accent' : ''}>{log.message}</span>
                </div>
              ))}
            </div>
          </div>

          {reminderMsg && (
            <div className="border border-accent/30 bg-accent/5 p-4 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-[9px] text-accent font-bold mb-2 uppercase tracking-widest">Generated Reminder (Compliant)</p>
              <p className="text-sm text-foreground font-light leading-relaxed">{reminderMsg}</p>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}