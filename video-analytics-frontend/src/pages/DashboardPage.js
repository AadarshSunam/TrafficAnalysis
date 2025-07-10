"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

const DashboardPage = () => {
  const [stats, setStats] = useState({
    totalSources: 0,
    totalScenarios: 0,
    activeStreams: 0,
  })
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const [sourcesResponse, scenariosResponse] = await Promise.all([
        api.get("/api/videosources/"),
        api.get("/api/scenarios/"),
      ])

      setStats({
        totalSources: sourcesResponse.data.length || sourcesResponse.data.count || 0,
        totalScenarios: scenariosResponse.data.length || scenariosResponse.data.count || 0,
        activeStreams: sourcesResponse.data.length || sourcesResponse.data.count || 0,
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    {
      title: "Manage Video Sources",
      description: "Add, edit, or delete video sources",
      icon: "fas fa-video",
      color: "primary",
      path: "/sources",
    },
    {
      title: "View Analytics",
      description: "Analyze traffic data and patterns",
      icon: "fas fa-chart-line",
      color: "success",
      path: "/traffic",
    },
    {
      title: "Live Stream",
      description: "Monitor live video feeds",
      icon: "fas fa-broadcast-tower",
      color: "info",
      path: "/stream",
    },
  ]

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
            <i className="fas fa-tachometer-alt me-2"></i>
            Dashboard
          </h1>
          <p className="text-muted">Welcome to your video analytics dashboard</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row mb-5">
        <div className="col-md-4 mb-3">
          <div className="card stats-card">
            <div className="card-body text-center">
              <i className="fas fa-video fa-2x mb-3"></i>
              <div className="stats-number">{stats.totalSources}</div>
              <h5 className="card-title">Video Sources</h5>
              <p className="card-text opacity-75">Total configured sources</p>
            </div>
          </div>
        </div>
        <div className="col-md-4 mb-3">
          <div className="card stats-card">
            <div className="card-body text-center">
              <i className="fas fa-map-marker-alt fa-2x mb-3"></i>
              <div className="stats-number">{stats.totalScenarios}</div>
              <h5 className="card-title">Scenarios</h5>
              <p className="card-text opacity-75">Available monitoring scenarios</p>
            </div>
          </div>
        </div>
        <div className="col-md-4 mb-3">
          <div className="card stats-card">
            <div className="card-body text-center">
              <i className="fas fa-broadcast-tower fa-2x mb-3"></i>
              <div className="stats-number">{stats.activeStreams}</div>
              <h5 className="card-title">Active Streams</h5>
              <p className="card-text opacity-75">Currently streaming sources</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="row">
        <div className="col">
          <h3 className="mb-4">Quick Actions</h3>
        </div>
      </div>
      <div className="row">
        {quickActions.map((action, index) => (
          <div key={index} className="col-md-4 mb-3">
            <div className="card quick-action-card h-100" onClick={() => navigate(action.path)}>
              <div className="card-body text-center">
                <i className={`${action.icon} fa-3x text-${action.color} mb-3`}></i>
                <h5 className="card-title">{action.title}</h5>
                <p className="card-text text-muted">{action.description}</p>
                <button className={`btn btn-${action.color}`}>
                  Get Started
                  <i className="fas fa-arrow-right ms-2"></i>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DashboardPage
