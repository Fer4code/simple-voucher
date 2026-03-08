import { Doughnut } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function PieChart({ stats }) {
    const { used, requested, unused, total } = stats

    if (total === 0) {
        return (
            <div className="empty-state" style={{ padding: '2rem' }}>
                <p>Sin datos</p>
            </div>
        )
    }

    const data = {
        labels: ['Usados', 'Solicitados', 'Disponibles'],
        datasets: [
            {
                data: [used, requested, unused],
                backgroundColor: [
                    'rgba(52, 211, 153, 0.8)',   // green - used
                    'rgba(251, 191, 36, 0.8)',   // yellow - requested
                    'rgba(96, 165, 250, 0.8)',   // blue - unused/available
                ],
                borderColor: [
                    'rgba(52, 211, 153, 1)',
                    'rgba(251, 191, 36, 1)',
                    'rgba(96, 165, 250, 1)',
                ],
                borderWidth: 2,
                hoverBorderWidth: 3,
                hoverOffset: 8,
            }
        ]
    }

    const options = {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    font: {
                        family: 'Inter',
                        size: 12,
                        weight: '500',
                    },
                    padding: 16,
                    usePointStyle: true,
                    pointStyleWidth: 10,
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 22, 41, 0.95)',
                titleFont: { family: 'Inter', size: 13, weight: '600' },
                bodyFont: { family: 'Inter', size: 12 },
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
                callbacks: {
                    label: function (context) {
                        const value = context.parsed
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
                        return ` ${context.label}: ${value} (${percentage}%)`
                    }
                }
            }
        },
        animation: {
            animateRotate: true,
            animateScale: true,
            duration: 800,
            easing: 'easeOutQuart'
        }
    }

    return <Doughnut data={data} options={options} />
}
