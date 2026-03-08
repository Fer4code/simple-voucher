import { useState, useEffect, useCallback } from 'react'
import './App.css'
import PieChart from './components/PieChart'
import VoucherTable from './components/VoucherTable'

const POLL_INTERVAL = 3000 // 3 seconds for near-real-time updates

function App() {
    const [vouchers, setVouchers] = useState([])
    const [stats, setStats] = useState({ total: 0, used: 0, requested: 0, unused: 0 })
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState(null)

    const fetchData = useCallback(async () => {
        try {
            const [vRes, sRes] = await Promise.all([
                fetch('/api/vouchers'),
                fetch('/api/vouchers/stats')
            ])
            const vData = await vRes.json()
            const sData = await sRes.json()
            setVouchers(vData)
            setStats(sData)
            setLastUpdated(new Date())
        } catch (err) {
            console.error('Error fetching data:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, POLL_INTERVAL)
        return () => clearInterval(interval)
    }, [fetchData])

    if (loading) {
        return (
            <div className="app">
                <div className="loading">
                    <div className="spinner"></div>
                    <p>Cargando datos...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <header className="app-header">
                <h1>📡 Voucher Manager</h1>
                <p>
                    Sistema de gestión de vouchers MikroTik
                    <span className="live-indicator">
                        <span className="live-dot"></span>
                        En vivo
                    </span>
                </p>
            </header>

            <main className="dashboard">
                {/* Stats + Pie Chart */}
                <div className="card" style={{ animationDelay: '0.1s' }}>
                    <div className="card-title">
                        <span className="icon">📊</span>
                        Resumen de Vouchers
                    </div>
                    <div className="chart-section">
                        <div className="chart-wrapper">
                            <PieChart stats={stats} />
                        </div>
                        <div className="stats-row">
                            <div className="stat-box stat-total">
                                <div className="stat-value">{stats.total}</div>
                                <div className="stat-label">Total</div>
                            </div>
                            <div className="stat-box stat-used">
                                <div className="stat-value">{stats.used}</div>
                                <div className="stat-label">Usados</div>
                            </div>
                            <div className="stat-box stat-requested">
                                <div className="stat-value">{stats.requested}</div>
                                <div className="stat-label">Solicitados</div>
                            </div>
                            <div className="stat-box stat-unused">
                                <div className="stat-value">{stats.unused}</div>
                                <div className="stat-label">Disponibles</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Voucher Table */}
                <div className="card" style={{ animationDelay: '0.2s' }}>
                    <div className="card-title">
                        <span className="icon">🎫</span>
                        Lista de Vouchers
                        {lastUpdated && (
                            <span className="live-indicator" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                                Actualizado: {lastUpdated.toLocaleTimeString('es-VE')}
                            </span>
                        )}
                    </div>
                    <VoucherTable vouchers={vouchers} />
                </div>
            </main>
        </div>
    )
}

export default App
