import { create } from 'zustand'

export interface Transaction {
  id: string
  date: string
  amount: number
  type: 'credit' | 'payment'
}

export interface Customer {
  id: string
  name: string
  address: string
  balance: number
  limit: number
  lastTransaction: string
  status: 'ok' | 'over-limit' | 'missed-payment'
  optedIn: boolean
  transactions: Transaction[]
}

export interface ActivityLog {
  id: string
  message: string
  timestamp: string
  type: 'hardware-entry' | 'system' | 'reminder'
}

export interface RecentEntry {
  name: string
  amount: number
  kind: string
  balance: number
  time: string
}

interface BackendSnapshot {
  customers: { name: string; balance: number; limit: number; opted_in: boolean; address?: string }[]
  entries: { id: string; customer: string; amount: number; kind: 'credit' | 'payment'; date: string; ts?: string }[]
  today_credit: number
}

interface AppState {
  isAuthenticated: boolean
  login: () => void
  logout: () => void

  customers: Customer[]
  activityLog: ActivityLog[]
  recentEntries: RecentEntry[]

  notification: { message: string; type: 'success' | 'info' } | null
  clearNotification: () => void

  backendConnected: boolean
  setConnected: (v: boolean) => void
  liveStatus: 'idle' | 'listening' | 'processing' | 'saved' | 'limit' | 'error' | 'noisy' | 'ask'
  lastTranscript: string
  lastReply: string
  latency: { stt: number | null; firstAudio: number | null }
  disclosureShown: boolean
  applyEvent: (ev: any) => void
  syncFromBackend: (snap: BackendSnapshot) => void
  sendCommand: (text: string) => Promise<void>

  addEntry: (customerName: string, amount: number, type: 'credit' | 'payment') => void
  sendReminder: (customerId: string) => string

  searchQuery: string
  setSearchQuery: (q: string) => void
  simulateHardwarePress: () => void
}

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
const rid = () => Math.random().toString(36).substr(2, 9)
const HTTP = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export const useStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false }),

  customers: [],
  activityLog: [{ id: '0', message: 'System initialized. Waiting for backend link…', timestamp: now(), type: 'system' }],
  recentEntries: [],

  notification: null,
  clearNotification: () => set({ notification: null }),

  backendConnected: false,
  setConnected: (v) => set((s) => ({
    backendConnected: v,
    activityLog: v && !s.backendConnected
      ? [{ id: rid(), message: 'Backend link established (/ui websocket).', timestamp: now(), type: 'system' as const }, ...s.activityLog]
      : s.activityLog
  })),
  liveStatus: 'idle',
  lastTranscript: '',
  lastReply: '',
  latency: { stt: null, firstAudio: null },
  disclosureShown: false,

  syncFromBackend: (snap) => set(() => {
    const entries = snap.entries || []
    const customers: Customer[] = (snap.customers || []).map((c) => {
      const tx: Transaction[] = entries
        .filter((e) => e.customer === c.name)
        .map((e) => ({ id: e.id, date: fmtDate(e.date), amount: e.amount, type: e.kind }))
        .reverse()
      const hasPayment = tx.some((t) => t.type === 'payment')
      const status: Customer['status'] =
        c.balance > c.limit ? 'over-limit' : (c.balance > 0 && !hasPayment ? 'missed-payment' : 'ok')
      return {
        id: slug(c.name),
        name: c.name,
        address: c.address || 'Bengaluru, Karnataka.',
        balance: c.balance,
        limit: c.limit,
        lastTransaction: tx[0]?.date || '—',
        status,
        optedIn: !!c.opted_in,
        transactions: tx,
      }
    })
    return { customers }
  }),

  applyEvent: (ev) => {
    const s = get()
    switch (ev.type) {
      case 'ledger':
        s.syncFromBackend(ev.data)
        break
      case 'transcript':
        set({ lastTranscript: ev.text || '' })
        break
      case 'reply':
        set({ lastReply: ev.text || '' })
        break
      case 'status':
        set({ liveStatus: ev.state || 'idle' })
        break
      case 'disclosure':
        set((st) => ({
          disclosureShown: true,
          activityLog: [{ id: rid(), message: 'AI disclosure spoken: "' + ev.text + '"', timestamp: now(), type: 'system' as const }, ...st.activityLog]
        }))
        break
      case 'latency':
        set((st) => ({ latency: { stt: ev.stt_s ?? st.latency.stt, firstAudio: ev.first_audio_s ?? st.latency.firstAudio } }))
        break
      case 'entry':
        const newEntry: RecentEntry = { name: ev.customer, amount: ev.amount, kind: ev.kind, balance: ev.balance, time: now() }
        set((st) => ({
          recentEntries: [newEntry, ...st.recentEntries].slice(0, 5), // Keep last 5 entries
          notification: { message: `WhatsApp receipt automatically sent to ${ev.customer}`, type: 'success' },
          activityLog: [{
            id: rid(),
            message: `ESP32 Entry: ${ev.customer} ${ev.kind === 'credit' ? '+' : '-'}₹${ev.amount} (Bal: ₹${ev.balance})`,
            timestamp: now(), type: 'hardware-entry' as const
          }, ...st.activityLog]
        }))
        break
      case 'correction':
        set((st) => ({ activityLog: [{ id: rid(), message: `Correction: entry ${ev.id} fixed to ₹${ev.amount}`, timestamp: now(), type: 'hardware-entry' as const }, ...st.activityLog] }))
        break
      case 'undo':
        set((st) => ({ activityLog: [{ id: rid(), message: `Undo: entry ${ev.id} removed`, timestamp: now(), type: 'hardware-entry' as const }, ...st.activityLog] }))
        break
      case 'limit_set':
        set((st) => ({ activityLog: [{ id: rid(), message: `Limit set: ${ev.customer} → ₹${ev.limit}`, timestamp: now(), type: 'system' as const }, ...st.activityLog] }))
        break
      case 'optin':
        set((st) => ({ activityLog: [{ id: rid(), message: `QR opt-${ev.value ? 'in' : 'out'}: ${ev.customer}`, timestamp: now(), type: 'system' as const }, ...st.activityLog] }))
        break
    }
  },

  sendCommand: async (text) => {
    if (!text.trim()) return
    try {
      const r = await fetch(HTTP() + '/say', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) throw new Error('bad status')
    } catch {
      get().addEntry('Ramesh Sharma', 50, 'credit')
      set({ notification: { message: 'Backend offline — used local mock entry', type: 'info' } })
    }
  },

  addEntry: (name, amount, type) => set((state) => {
    const existing = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())
    let newCustomers = [...state.customers]
    let logMessage = ''
    if (existing) {
      const newBalance = type === 'credit' ? existing.balance + amount : Math.max(0, existing.balance - amount)
      const newStatus: Customer['status'] = newBalance > existing.limit ? 'over-limit' : 'ok'
      const newTransaction: Transaction = { id: rid(), date: fmtDate(new Date().toISOString().slice(0, 10)), amount, type }
      newCustomers = newCustomers.map(c => c.id === existing.id ? {
        ...c, balance: newBalance, status: newStatus, lastTransaction: 'Just now',
        transactions: [newTransaction, ...c.transactions]
      } : c)
      logMessage = `Local Entry: ${name} ${type === 'credit' ? '+' : '-'}₹${amount} (Bal: ₹${newBalance})`
    } else {
      const newBalance = type === 'credit' ? amount : 0
      newCustomers = [...newCustomers, {
        id: slug(name) + '-' + rid(), name, address: 'Bengaluru, Karnataka.', balance: newBalance, limit: 500,
        lastTransaction: 'Just now', status: newBalance > 500 ? 'over-limit' : 'ok', optedIn: false,
        transactions: [{ id: rid(), date: fmtDate(new Date().toISOString().slice(0, 10)), amount, type }]
      }]
      logMessage = `New Customer: ${name} (₹${amount})`
    }
    const newLog: ActivityLog = { id: rid(), message: logMessage, timestamp: now(), type: 'hardware-entry' }
    const notifMsg = type === 'credit' ? `WhatsApp receipt automatically sent to ${name}` : `Payment receipt sent to ${name}`
    return { customers: newCustomers, activityLog: [newLog, ...state.activityLog], notification: { message: notifMsg, type: 'success' } }
  }),

  sendReminder: (id) => {
    const customer = get().customers.find(c => c.id === id)
    if (!customer) return ''
    if (!customer.optedIn) return 'Error: Customer has not opted in for reminders.'
    return `Namaste ${customer.name} ji, aapka ₹${customer.balance} baaki hai. Suvidha anusar bhugtan kar sakte hain. Dhanyavaad.`
  },

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  simulateHardwarePress: () => { get().sendCommand('Ramesh Sharma ka 50 udhaar') },
}))