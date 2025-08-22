"use client"

import { useState, useEffect } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import { Line, Bar } from "react-chartjs-2"
import api from "../services/api"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

const TrafficPage = () => {
  const vehicleClasses = [
    "SUV",
    "ambulance",
    "auto_rickshaw",
    "bike",
    "bus",
    "car",
    "e-rickshaw",
    "micro_bus",
    "mini_truck",
    "police_vehicle",
    "school_bus",
    "scooter",
    "taxi",
    "tempo",
    "tractor",
    "transport_vehicle",
    "truck",
    "van",
  ]
  const directions = ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]
  const [scenarios, setScenarios] = useState([])
  const [filters, setFilters] = useState({
    scenario: "",
    vehicle_class: "",
    direction: "",
    timestamp__gte: "",
    timestamp__lte: "",
  })
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0,
  })
  const [chartData, setChartData] = useState({
    lineChart: null,
    barChart: null,
  })

  useEffect(() => {
    fetchScenarios()
  }, [])

  const fetchScenarios = async () => {
    try {
      const response = await api.get("/api/scenarios/")
      setScenarios(response.data.results || response.data)
    } catch (error) {
      console.error("Error fetching scenarios:", error)
    }
  }

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const params = {
        ...filters,
        page,
        page_size: pagination.page_size,
      }

      // Remove empty filters
      Object.keys(params).forEach((key) => {
        if (params[key] === "") {
          delete params[key]
        }
      })

      // Fix parameter names to match Django backend
      if (params.vehicle_class) {
        params["vehicle_class__name"] = params.vehicle_class
        delete params.vehicle_class
      }

      const response = await api.get("/api/vehiclecounts/", { params })
      const results = response.data.results || response.data

      setData(results)
      setPagination({
        page: response.data.page || page,
        page_size: response.data.page_size || 20,
        total: response.data.count || results.length,
        total_pages: response.data.total_pages || Math.ceil((response.data.count || results.length) / 20),
      })

      // Process data for charts
      processChartData(results)
    } catch (error) {
      console.error("Error fetching traffic data:", error)
      // Show user-friendly error message
      setData([])
      setChartData({ lineChart: null, barChart: null })
    } finally {
      setLoading(false)
    }
  }

  const processChartData = (results) => {
    if (!results || results.length === 0) {
      setChartData({ lineChart: null, barChart: null })
      return
    }

    // Sort data by timestamp first
    const sortedResults = [...results].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    // Determine appropriate time grouping based on data span
    const timestamps = sortedResults.map(item => new Date(item.timestamp))
    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)
    const timeSpan = maxTime - minTime
    
    let groupingInterval, formatFunction
    
    if (timeSpan <= 24 * 60 * 60 * 1000) { // Less than 24 hours
      groupingInterval = 60 * 60 * 1000 // Group by hour
      formatFunction = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (timeSpan <= 7 * 24 * 60 * 60 * 1000) { // Less than 7 days
      groupingInterval = 24 * 60 * 60 * 1000 // Group by day
      formatFunction = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } else { // More than 7 days
      groupingInterval = 7 * 24 * 60 * 60 * 1000 // Group by week
      formatFunction = (date) => `Week of ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    }

    // Group data by time intervals
    const groupedByTime = {}
    const directionData = {}

    sortedResults.forEach((item) => {
      const timestamp = new Date(item.timestamp)
      const groupKey = Math.floor(timestamp.getTime() / groupingInterval) * groupingInterval
      const groupDate = new Date(groupKey)
      const groupLabel = formatFunction(groupDate)

      if (!groupedByTime[groupLabel]) {
        groupedByTime[groupLabel] = 0
      }
      groupedByTime[groupLabel] += item.count || 1

      // Group by direction for bar chart
      const direction = item.direction || "Unknown"
      if (!directionData[direction]) {
        directionData[direction] = {}
      }
      if (!directionData[direction][groupLabel]) {
        directionData[direction][groupLabel] = 0
      }
      directionData[direction][groupLabel] += item.count || 1
    })

    const timeLabels = Object.keys(groupedByTime).sort((a, b) => {
      // Sort by the actual time values, not labels
      const aTime = Object.keys(groupedByTime).indexOf(a)
      const bTime = Object.keys(groupedByTime).indexOf(b)
      return aTime - bTime
    })
    
    const totalCounts = timeLabels.map((label) => groupedByTime[label])

    // Line chart data - Traffic over time
    const lineChartData = {
      labels: timeLabels,
      datasets: [
        {
          label: "Total Vehicle Count",
          data: totalCounts,
          borderColor: "rgb(75, 192, 192)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          tension: 0.3,
          fill: true,
        },
      ],
    }

    // Bar chart data - Vehicle count by direction (not stacked over time, but grouped by direction)
    const directions = Object.keys(directionData)
    const colors = [
      "rgba(255, 99, 132, 0.8)",
      "rgba(54, 162, 235, 0.8)", 
      "rgba(255, 205, 86, 0.8)",
      "rgba(75, 192, 192, 0.8)",
      "rgba(153, 102, 255, 0.8)",
      "rgba(255, 159, 64, 0.8)",
      "rgba(199, 199, 199, 0.8)",
      "rgba(83, 102, 255, 0.8)",
    ]

    // Calculate total count per direction across all time periods
    const directionTotals = directions.map(direction => {
      return Object.values(directionData[direction]).reduce((sum, count) => sum + count, 0)
    })

    const barChartData = {
      labels: directions.map(dir => dir.charAt(0).toUpperCase() + dir.slice(1)),
      datasets: [
        {
          label: "Total Vehicle Count by Direction",
          data: directionTotals,
          backgroundColor: colors.slice(0, directions.length),
          borderColor: colors.slice(0, directions.length).map(color => color.replace('0.8', '1')),
          borderWidth: 1,
        }
      ],
    }

    setChartData({
      lineChart: lineChartData,
      barChart: barChartData,
    })
  }

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value,
    })
  }

  const handleApplyFilters = () => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    fetchData(1)
  }

  const handlePageChange = (newPage) => {
    fetchData(newPage)
  }

  const downloadCSV = async () => {
    try {
      const params = { ...filters }
      Object.keys(params).forEach((key) => {
        if (params[key] === "") {
          delete params[key]
        }
      })

      // Add format=csv if your backend supports it
      params.format = "csv"

      const response = await api.get("/api/vehiclecounts/", {
        params,
        responseType: "blob",
      })

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `traffic_data_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error downloading CSV:", error)

      // Fallback: create CSV from JSON data
      if (data.length > 0) {
        const csvContent = convertToCSV(data)
        const blob = new Blob([csvContent], { type: "text/csv" })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.setAttribute("download", `traffic_data_${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
      }
    }
  }

  const convertToCSV = (data) => {
    if (data.length === 0) return ""

    const headers = Object.keys(data[0])
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header]
            return typeof value === "string" && value.includes(",") ? `"${value}"` : value
          })
          .join(","),
      ),
    ]

    return csvRows.join("\n")
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  }

  const barChartOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.y} vehicles`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
        title: {
          display: true,
          text: 'Vehicle Count'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Direction'
        }
      }
    }
  }

  return (
    <div className="container">
      <div className="row mb-4">
        <div className="col">
          <h1 className="h2 mb-3">
            <i className="fas fa-chart-line me-2"></i>
            Traffic Analytics
          </h1>
          <p className="text-muted">Analyze vehicle count data and traffic patterns</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">
            <i className="fas fa-filter me-2"></i>
            Filters
          </h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3 mb-3">
              <label htmlFor="scenario" className="form-label">
                Scenario
              </label>
              <select
                id="scenario"
                name="scenario"
                className="form-select"
                value={filters.scenario}
                onChange={handleFilterChange}
              >
                <option value="">All Scenarios</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.name}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor="vehicle_class" className="form-label">
                Vehicle Class
              </label>
              <select
                id="vehicle_class"
                name="vehicle_class"
                className="form-select"
                value={filters.vehicle_class}
                onChange={handleFilterChange}
              >
                <option value="">All Vehicle Classes</option>
                {vehicleClasses.map((vehicleClass) => (
                  <option key={vehicleClass} value={vehicleClass}>
                    {vehicleClass.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor="direction" className="form-label">
                Direction
              </label>
              <select
                id="direction"
                name="direction"
                className="form-select"
                value={filters.direction}
                onChange={handleFilterChange}
              >
                <option value="">All Directions</option>
                {directions.map((direction) => (
                  <option key={direction} value={direction}>
                    {direction.charAt(0).toUpperCase() + direction.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3 mb-3">
              <label className="form-label">Actions</label>
              <div className="d-grid">
                <button className="btn btn-primary" onClick={handleApplyFilters} disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Loading...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-search me-1"></i>
                      Apply Filters
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label htmlFor="timestamp__gte" className="form-label">
                From Date/Time
              </label>
              <input
                type="datetime-local"
                id="timestamp__gte"
                name="timestamp__gte"
                className="form-control"
                value={filters.timestamp__gte}
                onChange={handleFilterChange}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label htmlFor="timestamp__lte" className="form-label">
                To Date/Time
              </label>
              <input
                type="datetime-local"
                id="timestamp__lte"
                name="timestamp__lte"
                className="form-control"
                value={filters.timestamp__lte}
                onChange={handleFilterChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      {chartData.lineChart && (
        <>
          <div className="row mb-4">
            <div className="col">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">
                    <i className="fas fa-chart-line me-2"></i>
                    Traffic Volume Over Time
                  </h5>
                </div>
                <div className="card-body">
                  <div className="chart-container" style={{ height: '400px' }}>
                    <Line data={chartData.lineChart} options={chartOptions} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col">
              <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">
                    <i className="fas fa-chart-bar me-2"></i>
                    Total Vehicle Count by Direction
                  </h5>
                </div>
                <div className="card-body">
                  <div className="chart-container" style={{ height: '400px' }}>
                    <Bar data={chartData.barChart} options={barChartOptions} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Data Table */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            <i className="fas fa-table me-2"></i>
            Traffic Data
            {pagination.total > 0 && <span className="badge bg-secondary ms-2">{pagination.total} records</span>}
          </h5>
          {data.length > 0 && (
            <button className="btn btn-success btn-sm" onClick={downloadCSV}>
              <i className="fas fa-download me-1"></i>
              Download CSV
            </button>
          )}
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading-spinner">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : data.length > 0 ? (
            <>
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Scenario</th>
                      <th>Vehicle Class</th>
                      <th>Direction</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item, index) => (
                      <tr key={index}>
                        <td>{new Date(item.timestamp).toLocaleString()}</td>
                        <td>
                          <span className="badge bg-secondary">{item.scenario || "N/A"}</span>
                        </td>
                        <td>
                          <span className="badge bg-info vehicle-class-badge">
                            {item.vehicle_class?.replace(/_/g, " ") || "N/A"}
                          </span>
                        </td>
                        <td>{item.direction || "N/A"}</td>
                        <td>
                          <span className="badge bg-primary">{item.count || 1}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total_pages > 1 && (
                <nav aria-label="Traffic data pagination">
                  <ul className="pagination justify-content-center">
                    <li className={`page-item ${pagination.page <= 1 ? "disabled" : ""}`}>
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                      >
                        <i className="fas fa-chevron-left"></i>
                        Previous
                      </button>
                    </li>

                    {[...Array(Math.min(5, pagination.total_pages))].map((_, i) => {
                      const pageNum = Math.max(1, pagination.page - 2) + i
                      if (pageNum > pagination.total_pages) return null

                      return (
                        <li key={pageNum} className={`page-item ${pagination.page === pageNum ? "active" : ""}`}>
                          <button className="page-link" onClick={() => handlePageChange(pageNum)}>
                            {pageNum}
                          </button>
                        </li>
                      )
                    })}

                    <li className={`page-item ${pagination.page >= pagination.total_pages ? "disabled" : ""}`}>
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.total_pages}
                      >
                        Next
                        <i className="fas fa-chevron-right ms-1"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              )}

              <div className="text-center text-muted">
                <small>
                  Showing {(pagination.page - 1) * pagination.page_size + 1} to{" "}
                  {Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total} entries
                </small>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <i className="fas fa-chart-line fa-3x text-muted mb-3"></i>
              <h5>No Data Found</h5>
              <p className="text-muted">
                {Object.values(filters).some((v) => v !== "")
                  ? "No traffic data matches your current filters. Try adjusting your search criteria."
                  : 'No traffic data available. Apply filters and click "Apply Filters" to load data.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TrafficPage