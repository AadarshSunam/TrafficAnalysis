"use client"

import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import api from "../services/api"

const StreamPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sources, setSources] = useState([])
  const [selectedSource, setSelectedSource] = useState(id || "")
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [streamLoading, setStreamLoading] = useState(false)

  useEffect(() => {
    fetchSources()
  }, [])

  useEffect(() => {
    if (id && sources.length > 0) {
      setSelectedSource(id)
    }
  }, [id, sources])

  const fetchSources = async () => {
    try {
      const response = await api.get("/api/videosources/")
      setSources(response.data.results || response.data)
    } catch (error) {
      console.error("Error fetching sources:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSourceSelect = (sourceId) => {
    setSelectedSource(sourceId)
    setStreamError(false)
    setStreamLoading(true)
    navigate(`/stream/${sourceId}`)
  }

  const handleStreamLoad = () => {
    setStreamLoading(false)
    setStreamError(false)
  }

  const handleStreamError = () => {
    setStreamLoading(false)
    setStreamError(true)
    // Retry after 3 seconds
    setTimeout(() => {
      if (selectedSource) {
        setStreamError(false)
        setStreamLoading(true)
      }
    }, 3000)
  }

  const selectedSourceData = sources.find((s) => s.id.toString() === selectedSource)

  useEffect(() => {
    let refreshInterval

    if (selectedSource && !streamError) {
      // Refresh stream every 30 seconds to prevent stale connections
      refreshInterval = setInterval(() => {
        const img = document.querySelector(".stream-image")
        if (img) {
          const currentSrc = img.src
          img.src = ""
          setTimeout(() => {
            img.src = currentSrc + "?t=" + Date.now()
          }, 100)
        }
      }, 30000)
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [selectedSource, streamError])

  if (loading) {
    return (
      <div className="container">
        <div className="loading-spinner">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="row mb-4">
        <div className="col">
          <h1 className="h2 mb-3">
            <i className="fas fa-broadcast-tower me-2"></i>
            Live Stream
          </h1>
          <p className="text-muted">Monitor live video feeds from your sources</p>
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <label htmlFor="sourceSelect" className="form-label">
            Select Video Source
          </label>
          <select
            id="sourceSelect"
            className="form-select"
            value={selectedSource}
            onChange={(e) => handleSourceSelect(e.target.value)}
          >
            <option value="">Choose a source...</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} - {source.scenario?.name || source.scenario}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Source Cards Grid */}
      <div className="row mb-4">
        {sources.map((source) => (
          <div key={source.id} className="col-md-4 col-lg-3 mb-3">
            <div className={`card h-100 ${selectedSource === source.id.toString() ? "border-primary" : ""}`}>
              <div className="card-body">
                <h6 className="card-title">
                  <i className="fas fa-video me-1"></i>
                  {source.name}
                </h6>
                <p className="card-text">
                  <small className="text-muted">ID: {source.id}</small>
                  <br />
                  <span className="badge bg-secondary">{source.scenario?.name || source.scenario}</span>
                </p>
                <button
                  className={`btn btn-sm w-100 ${
                    selectedSource === source.id.toString() ? "btn-primary" : "btn-outline-primary"
                  }`}
                  onClick={() => handleSourceSelect(source.id)}
                >
                  {selectedSource === source.id.toString() ? (
                    <>
                      <i className="fas fa-eye me-1"></i>
                      Viewing
                    </>
                  ) : (
                    <>
                      <i className="fas fa-play me-1"></i>
                      View Stream
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stream Display */}
      {selectedSource && (
        <div className="row">
          <div className="col">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="fas fa-broadcast-tower me-2"></i>
                  {selectedSourceData?.name || `Source ${selectedSource}`}
                  {selectedSourceData?.scenario && (
                    <span className="badge bg-secondary ms-2">
                      {selectedSourceData.scenario.name || selectedSourceData.scenario}
                    </span>
                  )}
                </h5>
              </div>
              <div className="card-body p-0">
                <div className="stream-container">
                  {streamLoading && (
                    <div className="stream-error">
                      <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Loading stream...</span>
                      </div>
                      <p>Loading stream...</p>
                    </div>
                  )}

                  {streamError && (
                    <div className="stream-error">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <h5>Stream Connection Error</h5>
                      <p>Unable to connect to the video stream.</p>
                      <small className="text-muted mb-3 d-block">
                        Make sure your Django backend is running and the video source path is accessible.
                      </small>
                      <button
                        className="btn btn-primary me-2"
                        onClick={() => {
                          setStreamError(false)
                          setStreamLoading(true)
                        }}
                      >
                        <i className="fas fa-redo me-1"></i>
                        Retry Connection
                      </button>
                      <button
                        className="btn btn-outline-secondary"
                        onClick={() => window.open(`http://localhost:8000/api/stream/${selectedSource}/`, "_blank")}
                      >
                        <i className="fas fa-external-link-alt me-1"></i>
                        Open Direct Stream
                      </button>
                    </div>
                  )}

                  <img
                    src={`http://localhost:8000/api/stream/${selectedSource}/`}
                    alt={`Stream from ${selectedSourceData?.name || selectedSource}`}
                    className="stream-image"
                    onLoad={handleStreamLoad}
                    onError={handleStreamError}
                    crossOrigin="anonymous"
                    style={{
                      display: streamError || streamLoading ? "none" : "block",
                      maxWidth: "100%",
                      height: "auto",
                    }}
                  />
                </div>
              </div>
              <div className="card-footer">
                <div className="d-flex justify-content-between align-items-center">
                  <small className="text-muted">
                    <i className="fas fa-info-circle me-1"></i>
                    MJPEG Stream - Source ID: {selectedSource}
                  </small>
                  <div>
                    <button
                      className="btn btn-sm btn-outline-secondary me-2"
                      onClick={() => window.open(`http://localhost:8000/api/stream/${selectedSource}/`, "_blank")}
                    >
                      <i className="fas fa-external-link-alt me-1"></i>
                      Open in New Tab
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => {
                        setStreamError(false)
                        setStreamLoading(true)
                      }}
                    >
                      <i className="fas fa-redo me-1"></i>
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedSource && sources.length > 0 && (
        <div className="row">
          <div className="col">
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="fas fa-broadcast-tower fa-4x text-muted mb-4"></i>
                <h4>Select a Video Source</h4>
                <p className="text-muted">
                  Choose a video source from the dropdown above or click on one of the source cards to start streaming.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {sources.length === 0 && (
        <div className="row">
          <div className="col">
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="fas fa-video fa-4x text-muted mb-4"></i>
                <h4>No Video Sources Available</h4>
                <p className="text-muted">You need to add video sources before you can view streams.</p>
                <button className="btn btn-primary" onClick={() => navigate("/sources")}>
                  <i className="fas fa-plus me-1"></i>
                  Add Video Sources
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StreamPage
