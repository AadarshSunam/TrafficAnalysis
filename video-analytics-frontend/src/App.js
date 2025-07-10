"use client"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import Navbar from "./components/Navbar"
import ProtectedRoute from "./components/ProtectedRoute"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import DashboardPage from "./pages/DashboardPage"
import VideoSourcesPage from "./pages/VideoSourcesPage"
import StreamPage from "./pages/StreamPage"
import TrafficPage from "./pages/TrafficPage"

const AppContent = () => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <h5>Loading Application...</h5>
        </div>
      </div>
    )
  }

  return (
    <div className="App">
      <Navbar />
      <main className="main-content">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sources"
            element={
              <ProtectedRoute>
                <VideoSourcesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stream/:id?"
            element={
              <ProtectedRoute>
                <StreamPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/traffic"
            element={
              <ProtectedRoute>
                <TrafficPage />
              </ProtectedRoute>
            }
          />

          {/* Default Routes */}
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={
              <div className="container">
                <div className="row justify-content-center">
                  <div className="col-md-6 text-center">
                    <div className="card">
                      <div className="card-body py-5">
                        <i className="fas fa-exclamation-triangle fa-4x text-warning mb-4"></i>
                        <h2>Page Not Found</h2>
                        <p className="text-muted">The page you're looking for doesn't exist.</p>
                        <button className="btn btn-primary" onClick={() => window.history.back()}>
                          <i className="fas fa-arrow-left me-1"></i>
                          Go Back
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  )
}

export default App
