"use client"

import { createContext, useContext, useState, useEffect } from "react"
import api from "../services/api"

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      setIsAuthenticated(true)
      // You could decode the JWT to get user info if needed
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    try {
      const response = await api.post("/api/token/", {
        username,
        password,
      })

      const { access, refresh } = response.data
      localStorage.setItem("access_token", access)
      localStorage.setItem("refresh_token", refresh)

      setIsAuthenticated(true)
      setUser({ username })

      return { success: true }
    } catch (error) {
      console.error("Login error:", error)
      return {
        success: false,
        error: error.response?.data?.detail || "Login failed",
      }
    }
  }

  const register = async (username, email, password, password2) => {
    try {
      const response = await api.post("/api/register/", {
        username,
        email,
        password,
        password2,
      })

      return { success: true, data: response.data }
    } catch (error) {
      console.error("Registration error:", error)
      return {
        success: false,
        error: error.response?.data || "Registration failed",
      }
    }
  }

  const logout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    setIsAuthenticated(false)
    setUser(null)
  }

  const value = {
    isAuthenticated,
    user,
    login,
    register,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
