// src/pages/StreamPage.js
"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import api from "../services/api"

const StreamPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  const [sources, setSources] = useState([])
  const [selectedSource, setSelectedSource] = useState(id || "")
  const [loadingSources, setLoadingSources] = useState(true)

  const [imgSrc, setImgSrc] = useState(null)
  const [streamLoading, setStreamLoading] = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")

  const socketRef = useRef(null)
  const heartbeatRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectBackoffRef = useRef(1000) // ms initial
  const imageRef = useRef(null)
  const lastImageUpdateRef = useRef(0)
  const frameCountRef = useRef(0)
  const [fps, setFps] = useState(0)

  // FPS calculation
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      const currentFrames = frameCountRef.current
      frameCountRef.current = 0
      setFps(currentFrames)
    }, 1000)

    return () => clearInterval(fpsInterval)
  }, [])

  // fetch video sources
  useEffect(() => {
    setLoadingSources(true)
    api.get("/api/videosources/")
      .then(res => {
        const data = res.data.results || res.data
        setSources(data)
      })
      .catch(err => {
        console.error("Failed to load sources", err)
      })
      .finally(() => setLoadingSources(false))
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (socketRef.current) {
      try {
        if (socketRef.current.readyState === WebSocket.OPEN || 
            socketRef.current.readyState === WebSocket.CONNECTING) {
          socketRef.current.close(1000, "Normal closure")
        }
      } catch (e) {
        console.error("Error closing WebSocket:", e)
      }
      socketRef.current = null
    }
    setConnectionStatus("disconnected")
  }, [])

  // Enhanced WebSocket connection with better error handling
  const connectWebSocket = useCallback((sourceId) => {
    if (!sourceId) return

    cleanup() // Clean up any existing connection

    setImgSrc(null)
    setStreamError(null)
    setStreamLoading(true)
    setConnectionStatus("connecting")

    const proto = window.location.protocol === "https:" ? "wss" : "ws"
    const host = window.location.hostname
    const backendWsPort = process.env.REACT_APP_BACKEND_WS_PORT || 
                         (window.location.port === "3000" ? "8000" : (window.location.port || "8000"))
    const wsUrl = `${proto}://${host}:${backendWsPort}/ws/live/`

    let ws
    try {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer' // Optimize for binary data
    } catch (err) {
      console.error("WebSocket constructor failed", err)
      setStreamError("Failed to create WebSocket")
      setStreamLoading(false)
      setConnectionStatus("error")
      return
    }

    socketRef.current = ws

    // Connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close()
        setStreamError("Connection timeout")
        setStreamLoading(false)
        setConnectionStatus("timeout")
      }
    }, 10000) // 10 second timeout

    ws.onopen = () => {
      clearTimeout(connectionTimeout)
      console.log("WebSocket connected")
      setStreamLoading(false)
      setConnectionStatus("connected")
      reconnectBackoffRef.current = 1000 // Reset backoff
      
      // Send source selection
      try {
        ws.send(JSON.stringify({ source_id: sourceId }))
      } catch (e) {
        console.error("Error sending source_id:", e)
        setStreamError("Failed to select source")
        return
      }

      // Setup heartbeat with proper error handling
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "heartbeat" }))
          } catch (e) {
            console.error("Heartbeat send error:", e)
            clearInterval(heartbeatRef.current)
            heartbeatRef.current = null
          }
        }
      }, 15000)
    }

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        
        if (data.type === "heartbeat") {
          return // Ignore heartbeat responses
        }
        
        if (data.error) {
          console.error("Server error:", data.error)
          setStreamError(data.error)
          setConnectionStatus("error")
        } else if (data.image) {
          // Throttle image updates for smoother performance
          const now = Date.now()
          if (now - lastImageUpdateRef.current > 50) { // Max 20 FPS display
            const imageUrl = `data:image/jpeg;base64,${data.image}`
            setImgSrc(imageUrl)
            setStreamError(null)
            setConnectionStatus("streaming")
            lastImageUpdateRef.current = now
            frameCountRef.current += 1
          }
        } else if (data.status === "streaming_started") {
          setConnectionStatus("streaming")
          console.log("Streaming started successfully")
        }
      } catch (err) {
        console.error("WS message parse error:", err)
        setStreamError("Invalid server data")
        setConnectionStatus("error")
      }
    }

    ws.onerror = (e) => {
      clearTimeout(connectionTimeout)
      console.error("WebSocket error:", e)
      setStreamError("Connection error occurred")
      setStreamLoading(false)
      setConnectionStatus("error")
    }

    ws.onclose = (e) => {
      clearTimeout(connectionTimeout)
      console.warn("WebSocket closed:", e.code, e.reason)
      setStreamLoading(false)
      setConnectionStatus("disconnected")
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }

      // Auto-reconnect with exponential backoff for unexpected closures
      if (e.code !== 1000 && e.code !== 1001 && e.code !== 1006 && selectedSource) {
        const backoff = reconnectBackoffRef.current
        console.log(`Reconnecting in ${backoff}ms...`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (selectedSource && !socketRef.current) { // Only reconnect if still selected and not connected
            reconnectBackoffRef.current = Math.min(30000, backoff * 1.5)
            connectWebSocket(selectedSource)
          }
        }, backoff)
      }
    }
  }, [selectedSource, cleanup])

  // websocket effect
  useEffect(() => {
    if (!selectedSource) {
      cleanup()
      return
    }

    connectWebSocket(selectedSource)
    
    // Cleanup on unmount or source change
    return cleanup
  }, [selectedSource, connectWebSocket, cleanup])

  const retryConnection = () => {
    if (selectedSource) {
      reconnectBackoffRef.current = 1000 // Reset backoff
      connectWebSocket(selectedSource)
    }
  }

  const selectedSourceData = sources.find(s => s.id?.toString() === selectedSource?.toString())

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
      case "streaming":
        return "success"
      case "connecting":
        return "warning"
      case "error":
      case "timeout":
        return "danger"
      default:
        return "secondary"
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connecting":
        return "Connecting..."
      case "connected":
        return "Connected"
      case "streaming":
        return `Streaming (${fps} FPS)`
      case "error":
        return "Connection Error"
      case "timeout":
        return "Connection Timeout"
      default:
        return "Disconnected"
    }
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2><i className="fas fa-broadcast-tower me-2"></i> Live Stream</h2>
        <button className="btn btn-outline-secondary" onClick={() => navigate("/sources")}>
          Manage Sources
        </button>
      </div>

      {loadingSources ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
          <p className="mt-2">Loading sources...</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="row align-items-center">
              <div className="col-auto">
                <select 
                  className="form-select" 
                  value={selectedSource} 
                  onChange={e => setSelectedSource(e.target.value)}
                  disabled={streamLoading}
                >
                  <option value="">Select a video source</option>
                  {sources.map(src => (
                    <option key={src.id} value={src.id}>
                      {src.name} ({src.scenario?.name || src.scenario})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-auto">
                <span className={`badge bg-${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>
              {selectedSource && connectionStatus === "error" && (
                <div className="col-auto">
                  <button className="btn btn-sm btn-primary" onClick={retryConnection}>
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
          </div>

          {selectedSource ? (
            <div className="card">
              <div className="card-body">
                {streamLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary mb-2" role="status" />
                    <p>Connecting to stream...</p>
                  </div>
                )}

                {streamError && (
                  <div className="alert alert-danger">
                    <strong>Stream error:</strong> {String(streamError)}
                    <div className="mt-2">
                      <button className="btn btn-sm btn-primary me-2" onClick={retryConnection}>
                        Retry
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-secondary" 
                        onClick={() => setSelectedSource("")}
                      >
                        Select Different Source
                      </button>
                    </div>
                  </div>
                )}

                {!streamLoading && !streamError && imgSrc && (
                  <div className="text-center">
                    <img 
                      ref={imageRef}
                      src={imgSrc} 
                      alt={`Live from ${selectedSourceData?.name}`} 
                      className="img-fluid border rounded" 
                      style={{ 
                        maxHeight: "600px",
                        maxWidth: "100%",
                        objectFit: "contain"
                      }}
                      onError={() => {
                        console.error("Image load error")
                        setStreamError("Failed to load stream image")
                      }}
                    />
                    <div className="mt-3 d-flex justify-content-between align-items-center text-muted">
                      <small>Source: {selectedSourceData?.name}</small>
                      <small>
                        Status: <span className={`text-${getStatusColor()}`}>{getStatusText()}</span>
                      </small>
                    </div>
                  </div>
                )}

                {!streamLoading && !streamError && !imgSrc && connectionStatus === "connected" && (
                  <div className="text-center py-4">
                    <div className="spinner-border text-success mb-2" role="status" />
                    <p className="text-muted">Waiting for stream data...</p>
                  </div>
                )}

                {!streamLoading && !streamError && !imgSrc && connectionStatus === "streaming" && (
                  <div className="text-center py-4">
                    <p className="text-muted">Stream is active but no frames received yet...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              Choose a source to view the live stream.
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default StreamPage