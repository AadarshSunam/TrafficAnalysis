"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import { Line, Bar, Doughnut, Scatter } from "react-chartjs-2"
import api from "../services/api"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend)

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
  const directions = ["Lagankhel","Koteshwor","Kalanki","Godawari"]
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
    timeChart: null,
    directionChart: null,
    vehicleChart: null,
    peakHourChart: null,
    trafficFlowChart: null,
  })
  const [summaryStats, setSummaryStats] = useState({
    totalVehicles: 0,
    avgVehiclesPerHour: 0,
    peakHour: "",
    mostCommonVehicle: "",
    busiestDirection: "",
  })
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // Memoize fetchData to prevent unnecessary re-renders
  const fetchData = useCallback(async (page = 1) => {
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

      // Process data for charts and statistics
      processChartData(results)
      calculateSummaryStats(results)
      setLastRefresh(new Date())
    } catch (error) {
      console.error("Error fetching traffic data:", error)
      setData([])
      setChartData({ 
        timeChart: null, 
        directionChart: null, 
        vehicleChart: null, 
        peakHourChart: null,
        trafficFlowChart: null
      })
      setSummaryStats({
        totalVehicles: 0,
        avgVehiclesPerHour: 0,
        peakHour: "",
        mostCommonVehicle: "",
        busiestDirection: "",
      })
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.page_size])

  useEffect(() => {
    fetchScenarios()
    // Load initial data when component mounts
    fetchData(1)
  }, [])

  // Auto-refresh effect
  useEffect(() => {
    let intervalId
    
    if (autoRefresh) {
      // Refresh data every 30 seconds
      intervalId = setInterval(() => {
        fetchData(pagination.page)
      }, 30000)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [autoRefresh, pagination.page, fetchData])

  const fetchScenarios = async () => {
    try {
      const response = await api.get("/api/scenarios/")
      setScenarios(response.data.results || response.data)
    } catch (error) {
      console.error("Error fetching scenarios:", error)
    }
  }

  const calculateSummaryStats = (results) => {
    if (!results || results.length === 0) return

    // Calculate total vehicles
    const totalVehicles = results.reduce((sum, item) => sum + (item.count || 1), 0)
    
    // Calculate time span to get vehicles per hour
    const timestamps = results.map(item => new Date(item.timestamp)).sort()
    const timeSpanHours = timestamps.length > 1 
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60)
      : 1
    const avgVehiclesPerHour = timeSpanHours > 0 ? totalVehicles / timeSpanHours : totalVehicles
    
    // Find peak hour
    const hourlyCounts = {}
    results.forEach(item => {
      const hour = new Date(item.timestamp).getHours()
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + (item.count || 1)
    })
    
    let peakHour = ""
    let maxCount = 0
    Object.entries(hourlyCounts).forEach(([hour, count]) => {
      if (count > maxCount) {
        maxCount = count
        peakHour = `${hour}:00 - ${parseInt(hour) + 1}:00`
      }
    })
    
    // Find most common vehicle class
    const vehicleCounts = {}
    results.forEach(item => {
      const vehicleClass = item.vehicle_class || "Unknown"
      vehicleCounts[vehicleClass] = (vehicleCounts[vehicleClass] || 0) + (item.count || 1)
    })
    
    let mostCommonVehicle = ""
    let maxVehicleCount = 0
    Object.entries(vehicleCounts).forEach(([vehicle, count]) => {
      if (count > maxVehicleCount) {
        maxVehicleCount = count
        mostCommonVehicle = vehicle
      }
    })

    const directionCounts = {}
    results.forEach(item => {
      const direction = item.direction || "Unknown"
      directionCounts[direction] = (directionCounts[direction] || 0) + (item.count || 1)
    })
    
    let busiestDirection = ""
    let maxDirectionCount = 0
    Object.entries(directionCounts).forEach(([direction, count]) => {
      if (count > maxDirectionCount) {
        maxDirectionCount = count
        busiestDirection = direction
      }
    })
    
    setSummaryStats({
      totalVehicles,
      avgVehiclesPerHour: Math.round(avgVehiclesPerHour),
      peakHour,
      mostCommonVehicle: mostCommonVehicle.replace(/_/g, " "),
      busiestDirection,
    })
  }

  const processChartData = (results) => {
    if (!results || results.length === 0) {
      setChartData({ 
        timeChart: null, 
        directionChart: null, 
        vehicleChart: null, 
        peakHourChart: null,
        trafficFlowChart: null
      })
      return
    }

    const sortedResults = [...results].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    const timeData = processTimeData(sortedResults)
    
    const directionData = processDirectionData(sortedResults)
    
    const vehicleData = processVehicleData(sortedResults)
    
    const peakHourData = processPeakHourData(sortedResults)

    const trafficFlowData = processTrafficFlowData(sortedResults)

    setChartData({
      timeChart: timeData,
      directionChart: directionData,
      vehicleChart: vehicleData,
      peakHourChart: peakHourData,
      trafficFlowChart: trafficFlowData,
    })
  }

  const processTrafficFlowData = (sortedResults) => {
    if (!sortedResults || sortedResults.length === 0) {
      return { datasets: [] }
    }

    // Get recent data (last 30 minutes) for live visualization
    const now = new Date()
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
    
    const recentData = sortedResults.filter(item => {
      const itemTime = new Date(item.timestamp)
      return itemTime >= thirtyMinutesAgo
    })

    if (recentData.length === 0) {
      return { datasets: [] }
    }

    // Group by direction and create actual data points from your API data
    const directionGroups = {}
    
    recentData.forEach(item => {
      const direction = item.direction || "Unknown"
      if (!directionGroups[direction]) {
        directionGroups[direction] = []
      }
      

      const count = item.count || 1
      for (let i = 0; i < Math.min(count, 10); i++) {
        let x, y
        
        switch(direction.toLowerCase()) {
          case "godawari":
            x = 0.5 + Math.random() * 0.4
            y = (Math.random() - 0.5) * 0.8
            break
          case "lagankhel":
            x = -0.5 - Math.random() * 0.4
            y = (Math.random() - 0.5) * 0.8
            break
          case "koteshwor":
            x = (Math.random() - 0.5) * 0.8
            y = 0.5 + Math.random() * 0.4
            break
          case "kalanki":
            x = (Math.random() - 0.5) * 0.8
            y = -0.5 - Math.random() * 0.4
            break
          default:
            x = (Math.random() - 0.5) * 1.5
            y = (Math.random() - 0.5) * 1.5
        }
        
        directionGroups[direction].push({ x, y })
      }
    })

    const colors = {
      "Godawari": "rgba(54, 162, 235, 0.8)",
      "Lagankhel": "rgba(255, 99, 132, 0.8)",
      "Koteshwor": "rgba(75, 192, 192, 0.8)", 
      "Kalanki": "rgba(255, 159, 64, 0.8)",
      "Unknown": "rgba(199, 199, 199, 0.8)"
    }

    const datasets = Object.keys(directionGroups).map(direction => {
      const dataPoints = directionGroups[direction]
      if (dataPoints.length === 0) return null
      
      return {
        label: `${direction} (${dataPoints.length} vehicles)`,
        data: dataPoints,
        backgroundColor: colors[direction] || colors["Unknown"],
        pointRadius: 6,
        pointHoverRadius: 8,
      }
    }).filter(Boolean)

    return { datasets }
  }


  const processTimeData = (sortedResults) => {
    // Determine appropriate time grouping based on data span
    const timestamps = sortedResults.map(item => new Date(item.timestamp))
    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)
    const timeSpan = maxTime - minTime
    
    let groupingInterval, formatFunction
    
    if (timeSpan <= 24 * 60 * 60 * 1000) { // Less than 24 hours
      groupingInterval = 60 * 60 * 1000 // Group by hour
      formatFunction = (date) => date.toLocaleTimeString([], { hour: '2-digit' })
    } else if (timeSpan <= 7 * 24 * 60 * 60 * 1000) { // Less than 7 days
      groupingInterval = 24 * 60 * 60 * 1000 // Group by day
      formatFunction = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } else { // More than 7 days
      groupingInterval = 7 * 24 * 60 * 60 * 1000 // Group by week
      formatFunction = (date) => `Week of ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    }

    // Group data by time intervals
    const groupedByTime = {}

    sortedResults.forEach((item) => {
      const timestamp = new Date(item.timestamp)
      const groupKey = Math.floor(timestamp.getTime() / groupingInterval) * groupingInterval
      const groupDate = new Date(groupKey)
      const groupLabel = formatFunction(groupDate)

      if (!groupedByTime[groupLabel]) {
        groupedByTime[groupLabel] = 0
      }
      groupedByTime[groupLabel] += item.count || 1
    })

    const timeLabels = Object.keys(groupedByTime).sort((a, b) => {
      // Sort by the actual time values, not labels
      const aTime = Object.keys(groupedByTime).indexOf(a)
      const bTime = Object.keys(groupedByTime).indexOf(b)
      return aTime - bTime
    })
    
    const totalCounts = timeLabels.map((label) => groupedByTime[label])

    // Time chart data - Traffic over time
    return {
      labels: timeLabels,
      datasets: [
        {
          label: "Vehicle Count",
          data: totalCounts,
          borderColor: "rgb(54, 162, 235)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          tension: 0.3,
          fill: true,
        },
      ],
    }
  }

  const processDirectionData = (sortedResults) => {
    // Group by direction
    const directionData = {}

    sortedResults.forEach((item) => {
      const direction = item.direction || "Unknown"
      if (!directionData[direction]) {
        directionData[direction] = 0
      }
      directionData[direction] += item.count || 1
    })

    const directions = Object.keys(directionData)
    const directionCounts = directions.map(direction => directionData[direction])
    
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

    return {
      labels: directions.map(dir => dir.charAt(0).toUpperCase() + dir.slice(1)),
      datasets: [
        {
          label: "Vehicle Count by Direction",
          data: directionCounts,
          backgroundColor: colors.slice(0, directions.length),
          borderColor: colors.slice(0, directions.length).map(color => color.replace('0.8', '1')),
          borderWidth: 1,
        }
      ],
    }
  }

  const processVehicleData = (sortedResults) => {
    const vehicleData = {}

    sortedResults.forEach((item) => {
      const vehicleClass = item.vehicle_class || "Unknown"
      if (!vehicleData[vehicleClass]) {
        vehicleData[vehicleClass] = 0
      }
      vehicleData[vehicleClass] += item.count || 1
    })

    const vehicles = Object.keys(vehicleData)
    const vehicleCounts = vehicles.map(vehicle => vehicleData[vehicle])
    
    const colors = [
      "rgba(255, 99, 132, 0.8)",
      "rgba(54, 162, 235, 0.8)", 
      "rgba(255, 205, 86, 0.8)",
      "rgba(75, 192, 192, 0.8)",
      "rgba(153, 102, 255, 0.8)",
      "rgba(255, 159, 64, 0.8)",
      "rgba(199, 199, 199, 0.8)",
      "rgba(83, 102, 255, 0.8)",
      "rgba(255, 99, 132, 0.8)",
      "rgba(54, 162, 235, 0.8)", 
      "rgba(255, 205, 86, 0.8)",
      "rgba(75, 192, 192, 0.8)",
      "rgba(153, 102, 255, 0.8)",
      "rgba(255, 159, 64, 0.8)",
      "rgba(199, 199, 199, 0.8)",
      "rgba(83, 102, 255, 0.8)",
    ]

    return {
      labels: vehicles.map(vehicle => vehicle.replace(/_/g, " ")),
      datasets: [
        {
          label: "Vehicle Count by Type",
          data: vehicleCounts,
          backgroundColor: colors.slice(0, vehicles.length),
          borderColor: colors.slice(0, vehicles.length).map(color => color.replace('0.8', '1')),
          borderWidth: 1,
        }
      ],
    }
  }

  const processPeakHourData = (sortedResults) => {
    // Group by hour of day
    const hourlyData = Array(24).fill(0)

    sortedResults.forEach((item) => {
      const hour = new Date(item.timestamp).getHours()
      hourlyData[hour] += item.count || 1
    })

    const hourLabels = Array.from({length: 24}, (_, i) => {
      return `${i.toString().padStart(2, '0')}:00`
    })

    return {
      labels: hourLabels,
      datasets: [
        {
          label: "Vehicles per Hour",
          data: hourlyData,
          borderColor: "rgb(255, 99, 132)",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
          tension: 0.3,
          fill: true,
        },
      ],
    }
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

  const handleRefreshNow = () => {
    fetchData(pagination.page)
  }

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh)
  }

  const downloadCSV = async () => {
    try {
      const params = { ...filters }
      Object.keys(params).forEach((key) => {
        if (params[key] === "") {
          delete params[key]
        }
      })

      params.format = "csv"

      const response = await api.get("/api/vehiclecounts/", {
        params,
        responseType: "blob",
      })

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
    indexAxis: 'y',
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.x} vehicles`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
        title: {
          display: true,
          text: 'Vehicle Count'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Direction'
        }
      }
    }
  }

  const vehicleChartOptions = {
    ...chartOptions,
    indexAxis: 'y',
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.x} vehicles`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
        title: {
          display: true,
          text: 'Vehicle Count'
        }
      },
    }
  }

  const peakHourOptions = {
    ...chartOptions,
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
          text: 'Hour of Day'
        }
      }
    }
  }

  const trafficFlowOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        min: -1.5,
        max: 1.5,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        title: {
          display: true,
          text: 'East-West Direction (Godawari ↔ Lagankhel)'
        }
      },
      y: {
        type: 'linear',
        min: -1.5,
        max: 1.5,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        title: {
          display: true,
          text: 'North-South Direction (Koteshwor ↔ Kalanki)'
        }
      }
    },
    elements: {
      point: {
        radius: 6,
        hoverRadius: 8
      }
    }
  }

  return (
    <div className="container">
      {/* ... (keep all the existing JSX structure, just add the new visualization) */}
      
      <div className="row mb-4">
        <div className="col">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <h1 className="h2 mb-3">
                <i className="fas fa-chart-line me-2"></i>
                Traffic Analytics Dashboard
              </h1>
              <p className="text-muted">Monitor and analyze traffic patterns for better management</p>
            </div>
            <div className="text-end">
              <div className="mb-2">
                <button 
                  className={`btn btn-sm ${autoRefresh ? 'btn-success' : 'btn-outline-secondary'} me-2`}
                  onClick={toggleAutoRefresh}
                  title={autoRefresh ? 'Auto-refresh is ON' : 'Auto-refresh is OFF'}
                >
                  <i className={`fas ${autoRefresh ? 'fa-pause' : 'fa-play'} me-1`}></i>
                  Auto-refresh
                </button>
                <button 
                  className="btn btn-outline-primary btn-sm"
                  onClick={handleRefreshNow}
                  disabled={loading}
                >
                  <i className="fas fa-sync-alt me-1"></i>
                  Refresh Now
                </button>
              </div>
              <small className="text-muted">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Filters*/}
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
                Location
              </label>
              <select
                id="scenario"
                name="scenario"
                className="form-select"
                value={filters.scenario}
                onChange={handleFilterChange}
              >
                <option value="">All Locations</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.name}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor="vehicle_class" className="form-label">
                Vehicle Type
              </label>
              <select
                id="vehicle_class"
                name="vehicle_class"
                className="form-select"
                value={filters.vehicle_class}
                onChange={handleFilterChange}
              >
                <option value="">All Vehicle Types</option>
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

      {/* Summary Statistics*/}
      {data.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <h4 className="mb-3">Summary Statistics</h4>
          </div>
          <div className="col-md-2 col-6 mb-3">
            <div className="card bg-primary text-white text-center">
              <div className="card-body">
                <h5 className="card-title">{summaryStats.totalVehicles}</h5>
                <p className="card-text small">Total Vehicles</p>
              </div>
            </div>
          </div>
          <div className="col-md-2 col-6 mb-3">
            <div className="card bg-success text-white text-center">
              <div className="card-body">
                <h5 className="card-title">{summaryStats.avgVehiclesPerHour}</h5>
                <p className="card-text small">Avg/Hour</p>
              </div>
            </div>
          </div>
          <div className="col-md-4 col-6 mb-3">
            <div className="card bg-info text-white text-center">
              <div className="card-body">
                <h5 className="card-title">{summaryStats.peakHour}</h5>
                <p className="card-text small">Peak Hour</p>
              </div>
            </div>
          </div>
          <div className="col-md-2 col-6 mb-3">
            <div className="card bg-warning text-dark text-center">
              <div className="card-body">
                <h5 className="card-title text-capitalize">{summaryStats.mostCommonVehicle}</h5>
                <p className="card-text small">Most Common Vehicle</p>
              </div>
            </div>
          </div>
          <div className="col-md-2 col-6 mb-3">
            <div className="card bg-secondary text-white text-center">
              <div className="card-body">
                <h5 className="card-title text-capitalize">{summaryStats.busiestDirection}</h5>
                <p className="card-text small">Busiest Direction</p>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {chartData.trafficFlowChart && chartData.trafficFlowChart.datasets.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="fas fa-traffic-light me-2"></i>
                  Live Traffic Flow Visualization
                </h5>
                <small className="text-muted">
                  Real-time vehicle movement across directions (Last 30 minutes)
                </small>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '500px' }}>
                  <Scatter data={chartData.trafficFlowChart} options={trafficFlowOptions} />
                </div>
                <div className="row mt-3">
                  <div className="col-md-3 text-center">
                    <div className="d-flex align-items-center justify-content-center">
                      <div className="bg-primary rounded-circle me-2" style={{ width: '15px', height: '15px' }}></div>
                      <span>Godawari (East)</span>
                    </div>
                  </div>
                  <div className="col-md-3 text-center">
                    <div className="d-flex align-items-center justify-content-center">
                      <div className="bg-danger rounded-circle me-2" style={{ width: '15px', height: '15px' }}></div>
                      <span>Lagankhel (West)</span>
                    </div>
                  </div>
                  <div className="col-md-3 text-center">
                    <div className="d-flex align-items-center justify-content-center">
                      <div className="bg-success rounded-circle me-2" style={{ width: '15px', height: '15px' }}></div>
                      <span>Koteshwor (North)</span>
                    </div>
                  </div>
                  <div className="col-md-3 text-center">
                    <div className="d-flex align-items-center justify-content-center">
                      <div className="bg-warning rounded-circle me-2" style={{ width: '15px', height: '15px' }}></div>
                      <span>Kalanki (South)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing Charts*/}
      {chartData.timeChart && (
        <div className="row mb-4">
          <div className="col-lg-8 mb-4">
            <div className="card h-100">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="fas fa-car me-2"></i>
                  Vehicle Type Distribution
                </h5>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '300px' }}>
                  <Bar data={chartData.vehicleChart} options={vehicleChartOptions} />
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-4 mb-4">
            <div className="card h-100">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="fas fa-chart-area me-2"></i>
                  Peak Hour Analysis
                </h5>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '300px' }}>
                  <Line data={chartData.peakHourChart} options={peakHourOptions} />
                </div>
              </div>
            </div>
          </div>
        </div>
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
            <div className="text-center py-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2">Loading traffic data...</p>
            </div>
          ) : data.length > 0 ? (
            <>
              <div className="table-responsive">
                <table className="table table-hover table-sm">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Location</th>
                      <th>Vehicle Type</th>
                      <th>Direction</th>
                      <th className="text-end">Count</th>
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
                          <span className="badge bg-info text-dark">
                            {item.vehicle_class ? item.vehicle_class.replace(/_/g, " ") : "N/A"}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark">
                            <i className="fas fa-arrow-{item.direction} me-1"></i>
                            {item.direction || "N/A"}
                          </span>
                        </td>
                        <td className="text-end">
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
            <div className="text-center py-5">
              <i className="fas fa-chart-line fa-4x text-muted mb-3"></i>
              <h5>No Traffic Data Available</h5>
              <p className="text-muted">
                {Object.values(filters).some((v) => v !== "")
                  ? "No traffic data matches your current filters. Try adjusting your search criteria."
                  : 'Data will load automatically. You can also apply filters to refine the results.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TrafficPage