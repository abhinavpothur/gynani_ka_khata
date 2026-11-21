"use client"

import { useStore } from '@/lib/store'
import { useRouter, useParams } from 'next/navigation'
import { useMemo } from 'react'

export default function CustomerDetailsPage() {
  const { customers } = useStore()
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  const customer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId])

  if (!customer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-sm text-black/50">Customer not found.</p>
      </div>
    )
  }

  const totalCredits = customer.transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0)
  const totalPayments = customer.transactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40" />

      {/* Header */}
      <header className="relative z-10 border-b border-black/10 px-8 py-5 flex justify-between items-center bg-surface/80 backdrop-blur-md">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-black/60 hover:text-accent transition-colors"
        >
          ← Back to Ledger
        </button>
        <div className="text-[10px] font-mono text-black/30 border border-black/10 px-2 py-0.5 rounded-sm">
          PROFILE VIEW
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto p-8 lg:p-12 grid grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Profile Info */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          
          {/* Name & Status */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full ${
                customer.status === 'ok' ? 'bg-black/20' : 
                customer.status === 'over-limit' ? 'bg-alert' : 'bg-yellow-600'
              }`} />
              <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">
                {customer.status === 'ok' ? 'Good Standing' : customer.status === 'over-limit' ? 'Over Limit' : 'Missed Payment'}
              </p>
            </div>
            <h1 className="font-display text-5xl font-light tracking-tighter mb-2">{customer.name}</h1>
            <p className="text-sm text-black/60 leading-relaxed font-light">{customer.address}</p>
          </div>

          {/* Balance Card */}
          <div className="bg-surface border border-black/10 rounded-2xl p-6">
            <p className="text-[10px] font-mono uppercase tracking-widest text-black/40 mb-2">Current Balance</p>
            <p className={`font-display text-6xl font-light tracking-tighter ${customer.balance > 0 ? 'text-alert' : 'text-emerald-700'}`}>
              ₹{customer.balance}
            </p>
            <p className="text-xs text-black/30 mt-2 font-mono">LIMIT: ₹{customer.limit}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-black/10 rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-widest text-black/40 mb-1">Total Credit</p>
              <p className="font-mono text-xl font-medium">₹{totalCredits}</p>
            </div>
            <div className="bg-surface border border-black/10 rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-widest text-black/40 mb-1">Total Paid</p>
              <p className="font-mono text-xl font-medium text-emerald-700">₹{totalPayments}</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Transaction History */}
        <div className="col-span-12 lg:col-span-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-display text-2xl font-medium">Transaction History</h2>
            <span className="text-[10px] font-mono text-black/30 border border-black/10 px-2 py-0.5 rounded-sm">
              {customer.transactions.length} RECORDS
            </span>
          </div>

          <div className="bg-surface border border-black/10 rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-3 gap-4 px-6 py-3 border-b border-black/10 bg-black/5 text-[10px] font-mono uppercase tracking-widest text-black/40">
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-black/5">
              {customer.transactions.length === 0 ? (
                <p className="text-center py-12 font-mono text-sm text-black/30">No transactions yet.</p>
              ) : (
                customer.transactions.map((t) => (
                  <div key={t.id} className="grid grid-cols-3 gap-4 px-6 py-5 hover:bg-black/5 transition-colors">
                    <div>
                      <p className="font-mono text-sm text-black/60">{t.date}</p>
                    </div>
                    <div>
                      <p className="font-display text-sm font-medium">
                        {t.type === 'credit' ? 'Udhaar (Credit)' : 'Payment Received'}
                      </p>
                      <p className="text-[10px] font-mono text-black/30 mt-0.5">ID: {t.id.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-lg font-medium ${t.type === 'credit' ? 'text-alert' : 'text-emerald-700'}`}>
                        {t.type === 'credit' ? '+' : '-'}₹{t.amount}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}