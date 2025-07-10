// src/pages/RegisterPage.js

"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    password2: "",
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  // pull both register() and login() from our AuthContext
  const { register, login } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    // 1️⃣ First, attempt to register
    const regResult = await register(
      formData.username,
      formData.email,
      formData.password,
      formData.password2
    )

    if (regResult.success) {
      // 2️⃣ On registration success, immediately log in
      const loginResult = await login(formData.username, formData.password)
      if (loginResult.success) {
        // 3️⃣ Redirect to dashboard
        navigate("/dashboard")
      } else {
        // unlikely, but handle login error
        setErrors({ non_field_errors: [loginResult.error] })
      }
    } else {
      // 4️⃣ If registration failed, show the backend errors
      setErrors(regResult.error)
    }

    setLoading(false)
  }

  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow">
            <div className="card-body p-4">
              <div className="text-center mb-4">
                <i className="fas fa-user-plus fa-3x text-primary mb-3"></i>
                <h2 className="card-title">Register</h2>
                <p className="text-muted">Create your account</p>
              </div>

              {/* Show non-field errors */}
              {errors.non_field_errors && (
                <div className="alert alert-danger" role="alert">
                  {errors.non_field_errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Username */}
                <div className="mb-3">
                  <label htmlFor="username" className="form-label">Username</label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    className={`form-control ${errors.username ? "is-invalid" : ""}`}
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                  {errors.username && (
                    <div className="invalid-feedback">
                      {errors.username.join(", ")}
                    </div>
                  )}
                </div>

                {/* Email */}
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className={`form-control ${errors.email ? "is-invalid" : ""}`}
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                  {errors.email && (
                    <div className="invalid-feedback">
                      {errors.email.join(", ")}
                    </div>
                  )}
                </div>

                {/* Password */}
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    className={`form-control ${errors.password ? "is-invalid" : ""}`}
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  {errors.password && (
                    <div className="invalid-feedback">
                      {errors.password.join(", ")}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="mb-3">
                  <label htmlFor="password2" className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    id="password2"
                    name="password2"
                    className={`form-control ${errors.password2 ? "is-invalid" : ""}`}
                    value={formData.password2}
                    onChange={handleChange}
                    required
                  />
                  {errors.password2 && (
                    <div className="invalid-feedback">
                      {errors.password2.join(", ")}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Creating account...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-user-plus me-2"></i>
                      Create Account
                    </>
                  )}
                </button>
              </form>

              {/* Fallback link if user already has account */}
              <div className="text-center mt-3">
                <p className="mb-0">
                  Already have an account?{" "}
                  <Link to="/login" className="text-decoration-none">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
