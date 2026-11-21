import { useEffect } from 'react'
import { useStore } from './store'

export function useLiveLedger() {
  const applyEvent = useStore(s => s.applyEvent)
  const setConnected = useStore(s => s.setConnected)

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let retry = 0
    let ping: ReturnType<typeof setInterval> | undefined
    const url = process.env.NEXT_PUBLIC_BACKEND_WS || 'ws://localhost:8000/ui'

    const connect = () => {
      if (closed) return
      ws = new WebSocket(url)
      ws.onopen = () => {
        retry = 0
        setConnected(true)
        ping = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send('ping') }, 25000)
      }
      ws.onmessage = (e) => {
        try { applyEvent(JSON.parse(e.data)) } catch { /* ignore */ }
      }
      ws.onclose = () => {
        setConnected(false)
        if (ping) clearInterval(ping)
        if (!closed) setTimeout(connect, Math.min(5000, 1000 * 2 ** retry++))
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { closed = true; if (ping) clearInterval(ping); ws?.close() }
  }, [applyEvent, setConnected])
}