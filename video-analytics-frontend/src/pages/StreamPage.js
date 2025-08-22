"use client"

import React, { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import api from "../services/api"

export default function StreamPage() {
  const { id }       = useParams()
  const navigate     = useNavigate()

  const [sources, setSources]       = useState([])
  const [sel,     setSel]           = useState(id || "")
  const [loading, setLoading]       = useState(true)

  const [img,     setImg]           = useState(null)
  const [busy,    setBusy]          = useState(false)
  const [err,     setErr]           = useState(null)
  const wsRef                        = useRef(null)

  // 1) load sources
  useEffect(() => {
    api.get("/api/videosources/")
      .then(r => setSources(r.data.results || r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // 2) open WS when `sel` changes
  useEffect(() => {
    if (!sel) return
    setImg(null); setErr(null); setBusy(true)

    // close previous
    if (wsRef.current) wsRef.current.close()

    const proto = window.location.protocol === "https:" ? "wss" : "ws"
    const host  = window.location.hostname
    // dev: React=3000, Django=8000
    const port  = window.location.port === "3000" ? "8000" : window.location.port
    const url   = `${proto}://${host}:${port}/ws/live/`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ source_id: sel }))
    }

    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data)
      if (msg.error)      setErr(msg.error)
      else if (msg.image) setImg(`data:image/jpeg;base64,${msg.image}`)
      setBusy(false)
    }

    ws.onerror = e => {
      console.error("WS error", e)
      setErr("connection failed")
      setBusy(false)
    }

    ws.onclose = e => {
      if (!e.wasClean && !err) setErr("disconnected")
      setBusy(false)
    }

    return () => ws.close()
  }, [sel])

  if (loading) return <div>Loading cameras…</div>
  const current = sources.find(s => s.id.toString() === sel)

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between">
        <h2>Live Stream</h2>
        <button onClick={() => navigate("/sources")}>Manage Sources</button>
      </div>

      <select
        className="form-select my-3 w-auto"
        value={sel}
        onChange={e => setSel(e.target.value)}
      >
        <option value="">Pick a camera</option>
        {sources.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.scenario?.name})
          </option>
        ))}
      </select>

      {sel && (
        <div className="card">
          <div className="card-body text-center">
            {busy && <div>Connecting…</div>}
            {err  && <div className="text-danger">{err}</div>}
            {img  && <img src={img} alt="Live" className="img-fluid" />}
            {!busy && !err && !img && <div>Waiting for frames…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
