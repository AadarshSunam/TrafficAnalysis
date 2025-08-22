"use client"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

const Navbar = () => {
  const { isAuthenticated, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const isActive = (path) => {
    return location.pathname === path ? "active" : ""
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
      <div className="container">
        <Link className="navbar-brand" to="/dashboard">
          <i className="fas fa-video me-2"></i>
          Video Analytics
        </Link>

        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link className={`nav-link ${isActive("/dashboard")}`} to="/dashboard">
                <i className="fas fa-tachometer-alt me-1"></i>
                Dashboard
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive("/sources")}`} to="/sources">
                <i className="fas fa-video me-1"></i>
                Video Sources
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive("/traffic")}`} to="/traffic">
                <i className="fas fa-chart-line me-1"></i>
                Traffic Analytics
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive("/stream")}`} to="/stream">
                <i className="fas fa-broadcast-tower me-1"></i>
                Live Stream
              </Link>
            </li>
          </ul>

          <ul className="navbar-nav">
            <li className="nav-item dropdown">
              <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                <i className="fas fa-user me-1"></i>
                {user?.username || "User"}
              </a>
              <ul className="dropdown-menu">
                <li>
                  <button className="dropdown-item" onClick={handleLogout}>
                    <i className="fas fa-sign-out-alt me-1"></i>
                    Logout
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
