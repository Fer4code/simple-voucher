import { useState, useEffect, useCallback } from 'react';

export default function DailyReport() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Get today's date in YYYY-MM-DD format for default input
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        // Shift by timezone roughly, or just use local since the backend handles it as string
        return d.toISOString().split('T')[0];
    });

    const fetchReport = useCallback(async (date) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/report/daily?date=${date}`);
            if (!res.ok) throw new Error('Error al cargar reporte');
            const data = await res.json();
            setReport(data);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReport(selectedDate);
    }, [selectedDate, fetchReport]);

    const handleDateChange = (e) => {
        setSelectedDate(e.target.value);
    };

    return (
        <div className="report-container">
            <div className="report-header-controls">
                <p className="report-desc">
                    Muestra las estadísticas desde las 6:00 AM del día anterior hasta las 6:00 AM de la fecha seleccionada.
                </p>
                <div className="date-picker-wrapper">
                    <label htmlFor="report-date">Fecha:</label>
                    <input
                        type="date"
                        id="report-date"
                        value={selectedDate}
                        onChange={handleDateChange}
                        className="date-picker-input"
                    />
                </div>
            </div>

            {loading && (
                <div className="loading-sm">
                    <div className="spinner-sm"></div>
                    <span>Cargando reporte...</span>
                </div>
            )}

            {error && (
                <div className="empty-state">
                    <p className="error-text">⚠️ {error}</p>
                </div>
            )}

            {!loading && !error && report && (
                <div className="report-content animation-fade-in">

                    {/* Top Level Totals */}
                    <div className="stats-row report-stats-row">
                        <div className="stat-box stat-requested">
                            <div className="stat-value">{report.totals.requested}</div>
                            <div className="stat-label">Solicitados</div>
                        </div>
                        <div className="stat-box stat-used">
                            <div className="stat-value">{report.totals.used}</div>
                            <div className="stat-label">Usados</div>
                        </div>
                        <div className="stat-box stat-payment">
                            <div className="stat-value">${report.totals.totalPayment.toFixed(2)}</div>
                            <div className="stat-label">Pago Total</div>
                        </div>
                    </div>

                    {/* Session Stats */}
                    <div className="stats-row report-stats-row" style={{ marginTop: '1rem' }}>
                        <div className="stat-box stat-avg-time" style={{ background: '#f8f9fa', color: '#333' }}>
                            <div className="stat-value">{Math.round(report.totals.avgSessionMinutes)} min</div>
                            <div className="stat-label">Tiempo Promedio</div>
                        </div>
                        <div className="stat-box stat-max-time" style={{ background: '#f8f9fa', color: '#333' }}>
                            <div className="stat-value">{Math.round(report.totals.maxSessionMinutes)} min</div>
                            <div className="stat-label">Tiempo Máximo</div>
                        </div>
                    </div>

                    {/* Report Summary Details */}
                    <div className="report-summary">
                        <small>Período: {report.period.from} al {report.period.to}</small>
                        <small>Precio base: ${report.totals.voucherPrice} | En Stock: {report.totals.availableInStock}</small>
                    </div>

                    {/* Table per Seller */}
                    {report.sellers.length === 0 ? (
                        <div className="empty-state report-empty">
                            <p>No hubo actividad en este período para ningún vendedor.</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="voucher-table">
                                <thead>
                                    <tr>
                                        <th>Vendedor</th>
                                        <th>Solicitados</th>
                                        <th>Usados</th>
                                        <th>Pago a Recibir</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.sellers.map((s, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: '600' }}>{s.seller}</td>
                                            <td>{s.requested}</td>
                                            <td>{s.used}</td>
                                            <td className="payment-cell">${s.payment.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
