// src/pages/VideoSourcesPage.js
"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

const VideoSourcesPage = () => {
  const [sources, setSources] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSource, setEditingSource] = useState(null)
  const [formData, setFormData] = useState({ name: "", path: "", scenarioId: "" })
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.get("/api/videosources/"),
      api.get("/api/scenarios/")
    ])
      .then(([vsRes, scRes]) => {
        setSources(vsRes.data.results ?? vsRes.data)
        setScenarios(scRes.data.results ?? scRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = () => {
    setEditingSource(null)
    setFormData({ name: "", path: "", scenarioId: "" })
    setShowModal(true)
  }

  const handleEdit = (src) => {
    setEditingSource(src)
    setFormData({
      name: src.name,
      path: src.path,
      scenarioId: src.scenario?.id?.toString() || ""
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this source?")) return
    await api.delete(`/api/videosources/${id}/`)
    setSources(sources.filter(s => s.id !== id))
  }

  const handleStream = (id) => navigate(`/stream/${id}`)

  const handleIngest = async (id) => {
    try {
      await api.post(`/api/ingest/${id}/`)
      alert(`Ingestion started for source ${id}`)
    } catch (err) {
      console.error(err)
      alert("Error starting ingest; check console")
    }
  }

  const handleIngestAll = async () => {
    try {
      await api.post("/api/ingest/")
      alert("Bulk ingest started")
    } catch (err) {
      console.error(err)
      alert("Error starting bulk ingest")
    }
  }

  const handleChange = e => {
    const { name, value } = e.target
    setFormData(f => ({ ...f, [name]: value }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      name: formData.name,
      path: formData.path,
      scenario_id: formData.scenarioId
    }
    try {
      if (editingSource) {
        await api.put(`/api/videosources/${editingSource.id}/`, payload)
      } else {
        await api.post("/api/videosources/", payload)
      }
      const vsRes = await api.get("/api/videosources/")
      setSources(vsRes.data.results ?? vsRes.data)
      setShowModal(false)
    } catch (err) {
      console.error(err)
      alert("Failed to save source")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    )
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Video Sources</h2>
        <div>
          <button className="btn btn-success me-2" onClick={handleIngestAll}>
            <i className="fas fa-download me-1"></i>Ingest All
          </button>
          <button className="btn btn-primary" onClick={handleAdd}>
            <i className="fas fa-plus me-1"></i>Add Source
          </button>
        </div>
      </div>

      <table className="table table-hover mb-4">
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>Scenario</th><th>Path</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(src => (
            <tr key={src.id}>
              <td>{src.id}</td>
              <td>{src.name}</td>
              <td>{src.scenario?.name}</td>
              <td><code>{src.path}</code></td>
              <td>
                <div className="btn-group btn-group-sm">
                  <button className="btn btn-outline-success" title="Ingest" onClick={() => handleIngest(src.id)}>
                    <i className="fas fa-download"></i>
                  </button>
                  <button className="btn btn-outline-info" title="Stream" onClick={() => handleStream(src.id)}>
                    <i className="fas fa-broadcast-tower"></i>
                  </button>
                  <button className="btn btn-outline-primary" title="Edit" onClick={() => handleEdit(src)}>
                    <i className="fas fa-edit"></i>
                  </button>
                  <button className="btn btn-outline-danger" title="Delete" onClick={() => handleDelete(src.id)}>
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {sources.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center py-4 text-muted">
                No video sources found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <form className="modal-content" onSubmit={handleSubmit}>
              <div className="modal-header">
                <h5 className="modal-title">{editingSource ? "Edit Source" : "Add Source"}</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Path (e.g., RTSP/MJPEG URL)</label>
                  <input
                    name="path"
                    className="form-control"
                    placeholder="http://192.168.x.x:8080/video"
                    value={formData.path}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Scenario</label>
                  <select
                    name="scenarioId"
                    className="form-select"
                    value={formData.scenarioId}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select scenario</option>
                    {scenarios.map(sc => (
                      <option key={sc.id} value={sc.id}>{sc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowModal(false)}
                        disabled={submitting}>
                  Cancel
                </button>
                <button type="submit"
                        className="btn btn-primary"
                        disabled={submitting}>
                  {submitting
                    ? <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    : null}
                  {editingSource ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoSourcesPage
