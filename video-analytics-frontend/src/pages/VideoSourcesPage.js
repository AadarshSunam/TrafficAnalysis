// src/pages/VideoSourcesPage.js

"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

const VideoSourcesPage = () => {
  const [sources, setSources] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal & form state
  const [showModal, setShowModal] = useState(false)
  const [editingSource, setEditingSource] = useState(null)
  const [formData, setFormData] = useState({
    name: "",
    path: "",
    scenarioId: "",
  })
  const [submitting, setSubmitting] = useState(false)

  const navigate = useNavigate()

  // Load existing sources and scenarios
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [srcRes, scRes] = await Promise.all([
        api.get("/api/videosources/"),
        api.get("/api/scenarios/"),
      ])
      setSources(srcRes.data.results ?? srcRes.data)
      setScenarios(scRes.data.results ?? scRes.data)
    } catch (err) {
      console.error("Error fetching data:", err)
    } finally {
      setLoading(false)
    }
  }

  // Open modal for adding
  const handleAdd = () => {
    setEditingSource(null)
    setFormData({ name: "", path: "", scenarioId: "" })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (src) => {
    setEditingSource(src)
    setFormData({
      name: src.name,
      path: src.path,
      scenarioId: src.scenario?.id?.toString() || "",
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure?")) return
    try {
      await api.delete(`/api/videosources/${id}/`)
      fetchData()
    } catch (err) {
      console.error(err)
      alert("Error deleting source")
    }
  }

  const handleIngest = async (id) => {
    try {
      await api.post(`/api/ingest/${id}/`)
      alert("Ingest started")
    } catch (err) {
      console.error(err)
      alert("Error starting ingest")
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

  const handleStream = (id) => {
    navigate(`/stream/${id}`)
  }

  // Form input change
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((f) => ({ ...f, [name]: value }))
  }

  // Submit add/edit form
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    // Build payload exactly matching serializer fields
    const payload = {
      name: formData.name,
      path: formData.path,
      scenario_id: formData.scenarioId,  // serializer expects scenario_id write-only
    }

    try {
      if (editingSource) {
        await api.put(`/api/videosources/${editingSource.id}/`, payload)
      } else {
        await api.post("/api/videosources/", payload)
      }
      setShowModal(false)
      fetchData()
    } catch (err) {
      console.error("Error saving source:", err.response?.data || err)
      alert("Error saving source; check console for details.")
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
    <div className="container">
      <h2 className="mt-4 mb-3">Video Sources</h2>

      <div className="mb-3">
        <button className="btn btn-primary me-2" onClick={handleAdd}>
          <i className="fas fa-plus me-1"></i>Add Source
        </button>
        <button className="btn btn-success" onClick={handleIngestAll}>
          <i className="fas fa-download me-1"></i>Ingest All
        </button>
      </div>

      <div className="card mb-4">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Scenario</th>
                <th>Path</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.length > 0 ? (
                sources.map((src) => (
                  <tr key={src.id}>
                    <td>{src.id}</td>
                    <td>{src.name}</td>
                    <td>{src.scenario?.name}</td>
                    <td><code>{src.path}</code></td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => handleEdit(src)}>
                          <i className="fas fa-edit"></i>
                        </button>
                        <button className="btn btn-outline-danger" onClick={() => handleDelete(src.id)}>
                          <i className="fas fa-trash"></i>
                        </button>
                        <button className="btn btn-outline-success" onClick={() => handleIngest(src.id)}>
                          <i className="fas fa-download"></i>
                        </button>
                        <button className="btn btn-outline-info" onClick={() => handleStream(src.id)}>
                          <i className="fas fa-broadcast-tower"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted">
                    No video sources found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={handleSubmit}>
                <div className="modal-header">
                  <h5 className="modal-title">{editingSource ? "Edit Source" : "Add Source"}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                <div className="modal-body">
                  {/* Name */}
                  <div className="mb-3">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      name="name"
                      className="form-control"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  {/* Path */}
                  <div className="mb-3">
                    <label className="form-label">Path</label>
                    <input
                      type="text"
                      name="path"
                      className="form-control"
                      placeholder="e.g., /path/to/video.mp4"
                      value={formData.path}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  {/* Scenario */}
                  <div className="mb-3">
                    <label className="form-label">Scenario</label>
                    <select
                      name="scenarioId"
                      className="form-select"
                      value={formData.scenarioId}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select a scenario</option>
                      {scenarios.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? (
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    ) : null}
                    {editingSource ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoSourcesPage
